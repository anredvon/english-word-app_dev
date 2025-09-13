import os
import pymysql
from flask import Flask, request, jsonify, render_template, send_from_directory

app = Flask(__name__)

# =======================
# MySQL 연결 설정
# =======================
DB = {
    "host": "redvon1216.mysql.pythonanywhere-services.com",
    "user": "redvon1216",
    "password": os.environ.get("DB_PASS", "여기에실패시쓸패스워드"),  # PythonAnywhere Web탭 → Environment Variables에 DB_PASS 등록 권장
    "database": "redvon1216$default",
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}
def get_conn():
    return pymysql.connect(**DB)

# =======================
# UI 라우팅
# =======================
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory("static", filename)

@app.get("/healthz")
def healthz():
    return "ok", 200

# =======================
# API
# =======================

# 1) 단어 등록
@app.post("/api/words")
def api_create_word():
    data = request.get_json() or {}
    word = (data.get("word") or "").strip()
    meaning = (data.get("meaning") or "").strip()
    example = (data.get("example") or "").strip()
    reg = (data.get("registered_on") or "").strip()[:10]

    if not word or not meaning:
        return jsonify({"ok": False, "error": "word/meaning required"}), 400
    if not reg:
        import datetime
        reg = datetime.date.today().isoformat()

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO words (word, meaning, example, level, registered_on) VALUES (%s,%s,%s,%s,%s)",
            (word, meaning, example, 1, reg),
        )
        conn.commit()
        new_id = cur.lastrowid
    return jsonify({"ok": True, "id": new_id})

# 2) 단어 대량 등록
@app.post("/api/words/bulk")
def api_create_words_bulk():
    data = request.get_json() or {}
    items = data.get("items") or []
    if not items:
        return jsonify({"ok": False, "error": "items required"}), 400

    rows = []
    import datetime
    today_str = datetime.date.today().isoformat()
    for it in items:
        w = (it.get("word") or "").strip()
        m = (it.get("meaning") or "").strip()
        ex = (it.get("example") or "").strip()
        reg = (it.get("registered_on") or "").strip()[:10] or today_str
        if not w or not m:
            continue
        rows.append((w, m, ex, 1, reg))

    if not rows:
        return jsonify({"ok": False, "error": "no valid rows"}), 400

    with get_conn() as conn, conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO words (word, meaning, example, level, registered_on) VALUES (%s,%s,%s,%s,%s)",
            rows
        )
        conn.commit()
    return jsonify({"ok": True, "inserted": len(rows)})

# 3) 단어 목록
@app.get("/api/words")
def api_list_words():
    q_date = request.args.get("date")
    q = (request.args.get("q") or "").strip()

    sql = "SELECT * FROM words"
    conds, params = [], []
    if q_date:
        conds.append("registered_on = %s")
        params.append(q_date)
    if q:
        conds.append("(word LIKE %s OR meaning LIKE %s)")
        params.extend([f"%{q}%", f"%{q}%"])
    if conds:
        sql += " WHERE " + " AND ".join(conds)
    sql += " ORDER BY id DESC"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return jsonify(rows)

# 4) 퀴즈 풀
@app.get("/api/quiz")
def api_quiz_pool():
    q_date = request.args.get("date")
    with get_conn() as conn, conn.cursor() as cur:
        if q_date:
            cur.execute("SELECT * FROM words WHERE registered_on=%s ORDER BY id DESC", (q_date,))
        else:
            cur.execute("SELECT * FROM words ORDER BY id DESC")
        rows = cur.fetchall()
    return jsonify(rows)

# 5) 정답/오답 반영
@app.post("/api/words/<int:wid>/result")
def api_update_result(wid):
    data = request.get_json() or {}
    is_correct = bool(data.get("correct"))
    with get_conn() as conn, conn.cursor() as cur:
        if is_correct:
            cur.execute("UPDATE words SET correct=correct+1, last_tested=NOW() WHERE id=%s",(wid,))
        else:
            cur.execute("UPDATE words SET wrong=wrong+1, last_tested=NOW() WHERE id=%s",(wid,))
        conn.commit()
    return jsonify({"ok": True})

# 6) 일자별 통계
@app.get("/api/stats/daily")
def api_stats_daily():
    d_from = request.args.get("from")
    d_to = request.args.get("to")
    sql = """
      SELECT registered_on AS day,
             COUNT(*) AS words,
             SUM(correct) AS correct,
             SUM(wrong) AS wrong
        FROM words
    """
    conds, params = [], []
    if d_from:
        conds.append("registered_on >= %s")
        params.append(d_from)
    if d_to:
        conds.append("registered_on <= %s")
        params.append(d_to)
    if conds:
        sql += " WHERE " + " AND ".join(conds)
    sql += " GROUP BY registered_on ORDER BY registered_on DESC"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    for r in rows:
        tot = (r["correct"] or 0)+(r["wrong"] or 0)
        r["accuracy"] = round((r["correct"] or 0)*100/tot,1) if tot else 0
    return jsonify(rows)

# 7) 단어 삭제
@app.delete("/api/words/<int:wid>")
def api_delete_word(wid):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM words WHERE id=%s",(wid,))
        conn.commit()
    return jsonify({"ok": True})

# =======================

# === [추가] 등록일 캘린더용 날짜/건수 API (registered_on 기준, 기존 스키마 유지) ===
@app.get("/api/word-dates")
def api_word_dates():
    sql = """
      SELECT registered_on AS d, COUNT(*) AS cnt
      FROM words
      WHERE registered_on IS NOT NULL
      GROUP BY registered_on
      ORDER BY registered_on
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    def _to_str(v):
        try:
            return v.isoformat()
        except AttributeError:
            return str(v)

    dates = [_to_str(r["d"]) for r in rows]
    by_count = { _to_str(r["d"]): int(r["cnt"]) for r in rows }
    return jsonify({"dates": dates, "byCount": by_count})


if __name__ == "__main__":
    app.run(host="0.0.0.0",port=3000,debug=True)
