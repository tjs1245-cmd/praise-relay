"""테이블만 만들어요. .env(또는 환경변수)의 DB 접속 정보로 접속해서 한 번 실행하세요.
클라우드 DB에서는 CREATE DATABASE/USER 없이 이것만 쓰면 돼요: python init_db.py"""
import app

app.load_env()
app.query("""CREATE TABLE IF NOT EXISTS diary_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_key VARCHAR(10) NOT NULL,
  entry_date DATE NOT NULL,
  emotion VARCHAR(20) NOT NULL,
  sentence VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_date (user_key, entry_date)
) CHARACTER SET utf8mb4""")
print("diary_entries 준비 완료")
