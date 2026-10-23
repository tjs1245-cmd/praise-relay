-- MariaDB 에서 한 번만 실행하세요.
CREATE DATABASE IF NOT EXISTS emotion_diary CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'YOUR_DB_USER'@'localhost' IDENTIFIED BY 'CHANGE_ME_PASSWORD';
GRANT ALL PRIVILEGES ON emotion_diary.* TO 'YOUR_DB_USER'@'localhost';
FLUSH PRIVILEGES;

USE emotion_diary;
CREATE TABLE IF NOT EXISTS diary_entries (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_key   VARCHAR(10) NOT NULL,          -- user1 | user2
  entry_date DATE        NOT NULL,          -- 하루에 한 장
  emotion    VARCHAR(20) NOT NULL,          -- calm|happy|surprised|serious|excited
  sentence   VARCHAR(100) NOT NULL,         -- 오늘의 한 문장
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_date (user_key, entry_date)
) CHARACTER SET utf8mb4;
