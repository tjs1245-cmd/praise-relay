"""감정 일기장 서버. 화면(static/)과 API를 함께 내보내고, 데이터는 로컬 MariaDB에 저장해요."""
import argparse
import json
import mimetypes
import os
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import ssl
from collections import Counter
from urllib.parse import unquote

import pymysql

try:  # Vercel(Neon Postgres)에서 써요. 로컬 MariaDB만 쓰면 없어도 돼요.
    import pg8000.dbapi as pg
except ImportError:
    pg = None

DB_ERRORS = (pymysql.MySQLError,) + ((pg.Error,) if pg else ())

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "public")
MAX_BODY = 4 * 1024

USERS = {"user1": "주원", "user2": "시원"}
EMOTIONS = {"calm": "평온", "happy": "행복", "surprised": "놀람", "serious": "진지", "excited": "신남"}

PG_TABLE = """CREATE TABLE IF NOT EXISTS diary_entries (
  id SERIAL PRIMARY KEY,
  user_key VARCHAR(10) NOT NULL,
  entry_date DATE NOT NULL,
  emotion VARCHAR(20) NOT NULL,
  sentence VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_key, entry_date))"""
_pg_ready = False


def load_env():
    path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def db_url():
    """DATABASE_URL(Neon) 또는 POSTGRES_URL이 있으면 Postgres, 없으면 로컬 MariaDB를 써요."""
    return os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""


def connect():
    url = db_url()
    if url:
        u = urlparse(url)
        return pg.connect(user=unquote(u.username), password=unquote(u.password or ""), host=u.hostname,
                          port=u.port or 5432, database=u.path.lstrip("/"), ssl_context=ssl.create_default_context())
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "diary"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "emotion_diary"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        # 다른 클라우드 MySQL(TiDB 등)은 TLS가 필요해요. .env에 DB_SSL=1
        ssl=ssl.create_default_context() if os.environ.get("DB_SSL") == "1" else None,
    )


def query(sql, args=()):
    """결과는 항상 dict 목록이에요. 두 DB 모두 %s 자리표시자를 써요."""
    global _pg_ready
    con = connect()
    try:
        if db_url():
            cur = con.cursor()
            if not _pg_ready:  # 테이블이 없으면 처음 한 번 만들어요
                cur.execute(PG_TABLE)
                con.commit()
                _pg_ready = True
            cur.execute(sql, args)
            rows = []
            if cur.description:
                cols = [c[0] for c in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            con.commit()
            return rows
        with con.cursor() as cur:
            cur.execute(sql, args)
            return cur.fetchall()
    finally:
        con.close()


def year_range(year):
    return date(year, 1, 1), date(year + 1, 1, 1)


def row_json(r):
    return {"id": r["id"], "user": r["user_key"], "date": r["entry_date"].isoformat(),
            "emotion": r["emotion"], "sentence": r["sentence"]}


def get_entries(user, year):
    rows = query("SELECT * FROM diary_entries WHERE user_key=%s AND entry_date>=%s AND entry_date<%s "
                 "ORDER BY entry_date DESC", (user, *year_range(year)))
    return {"entries": [row_json(r) for r in rows]}


def save_entry(body):
    user, emotion = body.get("user"), body.get("emotion")
    sentence, day = body.get("sentence"), body.get("date") or date.today().isoformat()
    if user not in USERS:
        raise ValueError("누구의 일기장인지 골라 주세요.")
    if emotion not in EMOTIONS:
        raise ValueError("감정 스티커를 골라 주세요.")
    if not isinstance(sentence, str) or not (1 <= len(sentence.strip()) <= 100):
        raise ValueError("오늘의 한 문장을 1~100자로 적어 주세요.")
    try:
        day = date.fromisoformat(day)
    except (TypeError, ValueError):
        raise ValueError("날짜 형식이 올바르지 않아요.")
    if (day - date.today()).days > 1:  # 서버(UTC)와 한국 시간 하루 차이는 허용
        raise ValueError("미래의 일기는 쓸 수 없어요.")
    if db_url():
        upsert = """INSERT INTO diary_entries (user_key, entry_date, emotion, sentence) VALUES (%s,%s,%s,%s)
                    ON CONFLICT (user_key, entry_date) DO UPDATE
                    SET emotion=EXCLUDED.emotion, sentence=EXCLUDED.sentence, updated_at=NOW()"""
    else:
        upsert = """INSERT INTO diary_entries (user_key, entry_date, emotion, sentence) VALUES (%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE emotion=VALUES(emotion), sentence=VALUES(sentence)"""
    query(upsert, (user, day, emotion, sentence.strip()))
    r = query("SELECT * FROM diary_entries WHERE user_key=%s AND entry_date=%s", (user, day))[0]
    return {"entry": row_json(r)}


def get_summary(user, year):
    """한 해 요약: 감정별 횟수, 월별 대표 감정, 가장 많은 감정, 기록한 날 수."""
    rows = query("SELECT entry_date, emotion FROM diary_entries WHERE user_key=%s AND entry_date>=%s AND entry_date<%s",
                 (user, *year_range(year)))
    by_emotion = Counter(r["emotion"] for r in rows)
    per_month = {}
    for r in rows:
        per_month.setdefault(r["entry_date"].month, Counter())[r["emotion"]] += 1
    months = [{"month": m, "top": c.most_common(1)[0][0], "total": sum(c.values())} for m, c in sorted(per_month.items())]
    total = sum(by_emotion.values())
    top = by_emotion.most_common(1)[0][0] if by_emotion else None
    return {"year": year, "total": total, "top": top, "by_emotion": dict(by_emotion), "months": months}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        try:
            if url.path == "/api/config":
                return self.send_json(200, {"users": USERS, "emotions": EMOTIONS})
            if url.path in ("/api/entries", "/api/summary"):
                user = qs.get("user", [""])[0]
                if user not in USERS:
                    return self.send_json(400, {"error": "user 값이 올바르지 않아요."})
                try:
                    year = int(qs.get("year", [date.today().year])[0])
                except ValueError:
                    return self.send_json(400, {"error": "year 값이 올바르지 않아요."})
                fn = get_entries if url.path == "/api/entries" else get_summary
                return self.send_json(200, fn(user, year))
        except DB_ERRORS as e:
            return self.send_json(500, {"error": f"DB 오류: {e.args[-1]}"})
        self.serve_static(url.path)

    def do_PUT(self):
        if urlparse(self.path).path != "/api/entries":
            return self.send_json(404, {"error": "없는 주소예요."})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send_json(413, {"error": "본문이 너무 커요."})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("JSON 객체가 필요해요.")
            self.send_json(200, save_entry(body))
        except (ValueError, json.JSONDecodeError) as e:
            self.send_json(400, {"error": str(e)})
        except DB_ERRORS as e:
            self.send_json(500, {"error": f"DB 오류: {e.args[-1]}"})

    def serve_static(self, path):
        rel = "index.html" if path == "/" else path.lstrip("/")
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(STATIC_DIR + os.sep) or not os.path.isfile(full):
            return self.send_json(404, {"error": "없는 주소예요."})
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8090)
    args = ap.parse_args()
    try:
        connect().close()
        print("MariaDB 연결 OK")
    except DB_ERRORS as e:
        print("MariaDB 연결 실패:", e, "\n-> README.md의 2~3단계를 확인하세요.")
    print(f"http://127.0.0.1:{args.port}")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
