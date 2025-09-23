import os
from contextlib import contextmanager
from flask import Flask, render_template, request, jsonify
import pymysql

# -------------------------------------------------------
# Flask
# -------------------------------------------------------
app = Flask(__name__, static_folder="static", template_folder="templates")

# -------------------------------------------------------
# DB 연결 (PythonAnywhere MySQL)
# -------------------------------------------------------
DB_HOST = "redvon1216.mysql.pythonanywhere-services.com"
DB_USER = "redvon1216"
DB_NAME = "redvon1216$default"
DB_PASS = os.environ.get("DB_PASS", "")  # Web 탭 -> Environment variables

def _conn():
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )

@contextmanager
def conn():
    c = _conn()
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()

# -------------------------------------------------------
# Pages
# -------------------------------------------------------
@app.get("/")
def home():
    # templates/index.html 이 반드시 존재해야 함
    return render_template("index.html")

@app.get("/healthz")
def healthz():
    return "ok", 200

# -------------------------------------------------------
# API: 날짜별 등록 현황 (달력 마킹용)
# 프런트가 기대하는 형태:
#   {"dates": ["YYYY-MM-DD", ...],
#    "byCount": {"YYYY-MM-DD": 2, ...}}
# -------------------------------------------------------
@app.get("/api/word-dates")
def api_word_dates():
    with conn() as c:
        cur = c.cursor()
        cur.execute(
            """
            SELECT DATE_FORMAT(created_at, '%%Y-%%m-%%d') AS d, COUNT(*) AS cnt
            FROM words
            GROUP BY d
            ORDER BY d DESC
            """
        )
        rows = cur.fetchall()

    dates = [r["d"] for r in rows]
    by_count = {r["d"]: int(r["cnt"]) for r in rows}
    return jsonify({"dates": dates, "byCount": by_count})

# -------------------------------------------------------
# API: 단어 목록
#   - ?date=YYYY-MM-DD  (해당 날짜만)
#   - ?q=검색어          (word/meaning LIKE)
# 응답 필드: id, word, meaning, example, registered_on, correct, wrong
# (정답/오답은 현재 스키마에 없으므로 0 리턴)
# -------------------------------------------------------
@app.get("/api/words")
def api_words():
    q = (request.args.get("q") or "").strip()
    date = (request.args.get("date") or "").strip()

    sql = [
        "SELECT",
        "  id,",
        "  word,",
        "  meaning,",
        "  example,",
        "  DATE_FORMAT(created_at, '%%Y-%%m-%%d') AS registered_on,",
        "  0 AS correct,",
        "  0 AS wrong",
        "FROM words",
        "WHERE 1=1",
    ]
    params = []

    if date:
        sql.append("AND created_at = %s")
        params.append(date)

    if q:
        sql.append("AND (word LIKE %s OR meaning LIKE %s)")
        like = f"%{q}%"
        params.extend([like, like])

    sql.append("ORDER BY created_at DESC, id DESC")

    with conn() as c:
        cur = c.cursor()
        cur.execute("\n".join(sql), params)
        rows = cur.fetchall()

    return jsonify(rows)

# -------------------------------------------------------
# API: 단일 등록
# body: {word, meaning, example, registered_on}
# -------------------------------------------------------
@app.post("/api/words")
def api_words_create():
    data = request.get_json(force=True) or {}
    word = (data.get("word") or "").strip()
    meaning = (data.get("meaning") or "").strip()
    example = (data.get("example") or "").strip()
    date_str = (data.get("registered_on") or "").strip()  # YYYY-MM-DD

    if not word or not meaning:
        return jsonify({"ok": False, "error": "word/meaning required"}), 400

    if not date_str:
        # today()는 DB의 DEFAULT(curdate())가 채우므로 비워도 됨
        date_str = None

    with conn() as c:
        cur = c.cursor()
        if date_str:
            cur.execute(
                "INSERT INTO words (word, meaning, example, created_at) VALUES (%s,%s,%s,%s)",
                (word, meaning, example, date_str),
            )
        else:
            cur.execute(
                "INSERT INTO words (word, meaning, example) VALUES (%s,%s,%s)",
                (word, meaning, example),
            )

    return jsonify({"ok": True})

# -------------------------------------------------------
# API: 대량 등록
# body: {items: [{word, meaning, example, registered_on}, ...]}
# -------------------------------------------------------
@app.post("/api/words/bulk")
def api_words_bulk():
    data = request.get_json(force=True) or {}
    items = data.get("items") or []
    if not isinstance(items, list) or not items:
        return jsonify({"ok": False, "error": "items required"}), 400

    inserted = 0
    with conn() as c:
        cur = c.cursor()
        for it in items:
            w = (it.get("word") or "").strip()
            m = (it.get("meaning") or "").strip()
            ex = (it.get("example") or "").strip()
            d = (it.get("registered_on") or "").strip()
            if not w or not m:
                continue
            if d:
                cur.execute(
                    "INSERT INTO words (word, meaning, example, created_at) VALUES (%s,%s,%s,%s)",
                    (w, m, ex, d),
                )
            else:
                cur.execute(
                    "INSERT INTO words (word, meaning, example) VALUES (%s,%s,%s)",
                    (w, m, ex),
                )
            inserted += 1

    return jsonify({"ok": True, "inserted": inserted})

# -------------------------------------------------------
# API: 삭제
# -------------------------------------------------------
@app.delete("/api/words/<int:wid>")
def api_words_delete(wid: int):
    with conn() as c:
        cur = c.cursor()
        cur.execute("DELETE FROM words WHERE id=%s", (wid,))
    return jsonify({"ok": True})

# -------------------------------------------------------
# API: 퀴즈 풀 (선택 날짜의 단어 목록)
#   GET /api/quiz?date=YYYY-MM-DD
#   응답: id, word, meaning, example
# -------------------------------------------------------
@app.get("/api/quiz")
def api_quiz():
    date = (request.args.get("date") or "").strip()
    sql = [
        "SELECT id, word, meaning, example",
        "FROM words",
        "WHERE 1=1",
    ]
    params = []
    if date:
        sql.append("AND created_at = %s")
        params.append(date)
    sql.append("ORDER BY created_at DESC, id DESC")

    with conn() as c:
        cur = c.cursor()
        cur.execute("\n".join(sql), params)
        rows = cur.fetchall()
    return jsonify(rows)

# -------------------------------------------------------
# API: 퀴즈 정답 기록 (현 스키마에는 누적 칼럼이 없으니 no-op)
# body: {correct: true/false}
# -------------------------------------------------------
@app.post("/api/words/<int:wid>/result")
def api_quiz_result(wid: int):
    # 누적 통계 테이블이 있다면 여기서 INSERT/UPDATE 하면 됨.
    # 현재 스키마에서는 기록만 받은 뒤 OK 반환.
    _ = request.get_json(force=True) or {}
    return jsonify({"ok": True})

# -------------------------------------------------------
# (선택) 에러 핸들러: 디버깅 용이
# -------------------------------------------------------
@app.errorhandler(Exception)
def _all_err(e):
    # PythonAnywhere Error log에 Traceback이 찍히도록 하고,
    # 클라이언트엔 간단한 JSON 제공
    import traceback, sys
    traceback.print_exc(file=sys.stderr)
    return jsonify({"ok": False, "error": str(e)}), 500

# -------------------------------------------------------
# Local run
# -------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)


@app.route("/api/word-dates")
def word_dates():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # 날짜별 단어 등록 건수 집계
    cursor.execute("""
        SELECT DATE(created_at) as d, COUNT(*) as c
        FROM words
        GROUP BY DATE(created_at)
    """)
    rows = cursor.fetchall()

    conn.close()

    dates = [row['d'].strftime("%Y-%m-%d") for row in rows if row['d']]
    byCount = {row['d'].strftime("%Y-%m-%d"): row['c'] for row in rows if row['d']}

    return jsonify({"dates": dates, "byCount": byCount})

