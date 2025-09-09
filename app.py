from flask import Flask, render_template
import os
from dotenv import load_dotenv
import pymysql

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app = Flask(__name__)

# --- DB 연결 (옵션: DB 준비 전이면 이 블록을 주석 처리) ---
def get_db():
    return pymysql.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )

@app.route("/")
def index():
    words_count = None
    try:
        with get_db().cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM words")
            words_count = cur.fetchone()["cnt"]
    except Exception:
        # DB 미구성 시에도 페이지는 뜨도록
        words_count = "DB not ready"
    return render_template("index.html", words_count=words_count)

# 건강 체크용
@app.route("/health")
def health():
    return "ok"
