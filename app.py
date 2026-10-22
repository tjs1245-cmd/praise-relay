"""칭찬 릴레이 서버. 표준 라이브러리만 써서 화면(static/)과 API를 함께 내보내요."""
import argparse
import json
import os
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MAX_BODY = 8 * 1024
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
}

DB_PATH = os.path.join(BASE_DIR, "data", "entries.db")


def connect():
    return sqlite3.connect(DB_PATH)


def init_db():
    folder = os.path.dirname(os.path.abspath(DB_PATH))
    os.makedirs(folder, exist_ok=True)
    with connect() as con:
        con.execute(
            "CREATE TABLE IF NOT EXISTS entries ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "name TEXT NOT NULL, message TEXT NOT NULL, "
            "recipient TEXT, created_at TEXT NOT NULL)"
        )


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def to_entry(row_id, name, message, recipient, created_at):
    entry = {"id": row_id, "name": name, "message": message}
    if recipient:
        entry["to"] = recipient
    entry["created_at"] = created_at
    return entry


def required_text(data, field, label, limit):
    value = data.get(field)
    if not isinstance(value, str):
        raise ApiError(400, f"{label}은(는) 글자로 적어 주세요.")
    value = value.strip()
    if not 1 <= len(value) <= limit:
        raise ApiError(400, f"{label}은(는) 1~{limit}자로 적어 주세요.")
    return value


def optional_text(data, field, label, limit):
    value = data.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError(400, f"{label}은(는) 글자로 적어 주세요.")
    value = value.strip()
    if not value:
        return None
    if len(value) > limit:
        raise ApiError(400, f"{label}은(는) {limit}자 이하로 적어 주세요.")
    return value


class Handler(BaseHTTPRequestHandler):
    server_version = "PraiseRelay"

    def log_message(self, fmt, *args):
        pass

    def send_bytes(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, body, "application/json; charset=utf-8")

    def send_error_json(self, status, message):
        self.send_json(status, {"error": message})

    def route(self):
        return self.path.split("?", 1)[0]

    def do_GET(self):
        path = self.route()
        if path == "/api/entries":
            return self.list_entries()
        if path == "/":
            return self.send_static("index.html")
        if path.startswith("/static/"):
            return self.send_static(path[len("/static/"):])
        self.send_error_json(404, "없는 주소예요.")

    def do_POST(self):
        if self.route() != "/api/entries":
            return self.send_error_json(404, "없는 주소예요.")
        try:
            self.create_entry()
        except ApiError as e:
            self.send_error_json(e.status, e.message)
        except Exception:
            self.send_error_json(500, "서버에 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.")

    def method_not_allowed(self):
        self.send_error_json(405, "허용되지 않는 요청 방식이에요.")

    do_PUT = do_DELETE = do_PATCH = method_not_allowed

    def send_static(self, name):
        full = os.path.realpath(os.path.join(STATIC_DIR, name))
        inside = full.startswith(os.path.realpath(STATIC_DIR) + os.sep)
        content_type = CONTENT_TYPES.get(os.path.splitext(full)[1])
        if not inside or content_type is None or not os.path.isfile(full):
            return self.send_error_json(404, "없는 주소예요.")
        with open(full, "rb") as f:
            self.send_bytes(200, f.read(), content_type)

    def list_entries(self):
        with connect() as con:
            rows = con.execute(
                "SELECT id, name, message, recipient, created_at "
                "FROM entries ORDER BY id DESC LIMIT 200"
            ).fetchall()
        self.send_json(200, {"entries": [to_entry(*row) for row in rows]})

    def create_entry(self):
        length_header = self.headers.get("Content-Length")
        try:
            length = int(length_header)
        except (TypeError, ValueError):
            raise ApiError(400, "본문 길이(Content-Length)를 알려 주세요.")
        if length < 0:
            raise ApiError(400, "본문 길이(Content-Length)가 올바르지 않아요.")
        if length > MAX_BODY:
            raise ApiError(413, "본문이 너무 커요. 8KiB 이하로 보내 주세요.")
        content_type = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type != "application/json":
            raise ApiError(415, "JSON 형식(application/json)으로 보내 주세요.")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise ApiError(400, "JSON을 읽을 수 없어요.")
        if not isinstance(data, dict):
            raise ApiError(400, "JSON 객체로 보내 주세요.")

        name = required_text(data, "name", "작성자", 40)
        message = required_text(data, "message", "칭찬 한마디", 500)
        recipient = optional_text(data, "to", "받는 사람", 40)
        created_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

        with connect() as con:
            cur = con.execute(
                "INSERT INTO entries (name, message, recipient, created_at) VALUES (?, ?, ?, ?)",
                (name, message, recipient, created_at),
            )
            row_id = cur.lastrowid
        self.send_json(201, {"entry": to_entry(row_id, name, message, recipient, created_at)})


def main():
    global DB_PATH
    parser = argparse.ArgumentParser(description="칭찬 릴레이 서버")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", default=DB_PATH)
    args = parser.parse_args()
    DB_PATH = args.db
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"http://127.0.0.1:{args.port} (DB: {DB_PATH})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
