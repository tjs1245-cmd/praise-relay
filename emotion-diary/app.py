"""감정 일기장 서버. 화면(static/)과 API를 함께 내보내고, 데이터는 로컬 MariaDB에 저장해요."""
import argparse
import json
import mimetypes
import os
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import ssl

import pymysql

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "public")
MAX_BODY = 4 * 1024

USERS = {"user1": "주원", "user2": "시원"}
EMOTIONS = {"calm": "평온", "happy": "행복", "surprised": "놀람", "serious": "진지", "excited": "신남"}


def load_env():
    path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def connect():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "diary"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "emotion_diary"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        # 클라우드 DB(TiDB 등)는 TLS가 필요해요. .env에 DB_SSL=1
        ssl=ssl.create_default_context() if os.environ.get("DB_SSL") == "1" else None,
    )


def query(sql, args=()):
    con = connect()
    try:
        with con.cursor() as cur:
            cur.execute(sql, args)
            return cur.fetchall()
    finally:
        con.close()


def row_json(r):
    return {"id": r["id"], "user": r["user_key"], "date": r["entry_date"].isoformat(),
            "emotion": r["emotion"], "sentence": r["sentence"]}


def get_entries(user, year):
    rows = query("SELECT * FROM diary_entries WHERE user_key=%s AND YEAR(entry_date)=%s ORDER BY entry_date DESC",
                 (user, year))
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
    query("""INSERT INTO diary_entries (user_key, entry_date, emotion, sentence) VALUES (%s,%s,%s,%s)
             ON DUPLICATE KEY UPDATE emotion=VALUES(emotion), sentence=VALUES(sentence)""",
          (user, day, emotion, sentence.strip()))
    r = query("SELECT * FROM diary_entries WHERE user_key=%s AND entry_date=%s", (user, day))[0]
    return {"entry": row_json(r)}


def get_summary(user, year):
    """한 해 요약: 감정별 횟수, 월별 대표 감정, 가장 많은 감정, 기록한 날 수."""
    by_emotion = {r["emotion"]: r["n"] for r in query(
        "SELECT emotion, COUNT(*) n FROM diary_entries WHERE user_key=%s AND YEAR(entry_date)=%s GROUP BY emotion",
        (user, year))}
    months = {}
    for r in query("""SELECT MONTH(entry_date) m, emotion, COUNT(*) n FROM diary_entries
                      WHERE user_key=%s AND YEAR(entry_date)=%s GROUP BY m, emotion ORDER BY m, n DESC""",
                   (user, year)):
        months.setdefault(r["m"], {"top": r["emotion"], "total": 0})["total"] += r["n"]
    total = sum(by_emotion.values())
    top = max(by_emotion, key=by_emotion.get) if by_emotion else None
    return {"year": year, "total": total, "top": top, "by_emotion": by_emotion,
            "months": [{"month": m, **v} for m, v in sorted(months.items())]}


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
        except pymysql.MySQLError as e:
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
        except pymysql.MySQLError as e:
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
    except pymysql.MySQLError as e:
        print("MariaDB 연결 실패:", e, "\n-> README.md의 2~3단계를 확인하세요.")
    print(f"http://127.0.0.1:{args.port}")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
