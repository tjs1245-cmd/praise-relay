# 감정 일기장 (MariaDB 연결)

User1(주원) / User2(시원) 중 일기장을 고르고, 오늘의 감정 스티커 + 한 문장을 저장해요. 모인 기록으로 일 년 요약을 볼 수 있어요.

## 1. 패키지 설치
```
python -m pip install -r requirements.txt
```

## 2. MariaDB 준비 (한 번만)
MariaDB 서비스가 켜져 있어야 해요(기본 포트 3306). root 비밀번호로 `schema.sql`을 실행해요.
```
mysql -u root -p < schema.sql
```
`mysql` 명령이 없으면 HeidiSQL(또는 `C:\Program Files\MariaDB ...\bin\mysql.exe`)로 `schema.sql` 내용을 붙여 실행하세요.
`emotion_diary` 데이터베이스, 사용자, `diary_entries` 테이블이 만들어져요. 먼저 `schema.sql`의 `YOUR_DB_USER`와 `CHANGE_ME_PASSWORD`를 원하는 값으로 바꾸고, `.env`에도 같은 값을 적으세요.

## 3. 접속 정보
`.env.example`을 `.env`로 복사하고 값을 확인해요. (`.env`는 git에 올리지 마세요)

## 4. 실행
```
python app.py
```
http://127.0.0.1:8090 을 열어요. 터미널에 `MariaDB 연결 OK`가 보이면 성공이에요.

## API
- GET /api/config
- GET /api/entries?user=user1&year=2026
- PUT /api/entries  `{user, date, emotion, sentence}` (하루 한 장, 같은 날 다시 저장하면 덮어써요)
- GET /api/summary?user=user1&year=2026  (감정별 횟수, 월별 대표 감정)

## 스티커 다시 만들기
`python make_stickers.py 1.webp 2.webp` (캐릭터 시트 이미지에서 표정 5개를 잘라요)
