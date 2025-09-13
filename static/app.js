/* ====== 공통 유틸 ====== */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a; }
function today(){ return new Date().toISOString().slice(0,10); }
async function jget(url){ const r=await fetch(url); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function jpost(url, body){ const r=await fetch(url,{method:"POST",headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body)}); if(!r.ok) throw new Error(await r.text()); return r.json(); }

/* ====== 엘리먼트 ====== */
const form = $("wordForm");
const wordEl = $("word");
const meaningEl = $("meaning");
const exampleEl = $("example");
const regDateEl = $("regDate");

const bulkSection = $("bulkSection");
const toggleBulk = $("toggleBulk");
const bulkInput = $("bulkInput");
const bulkDateEl = $("bulkDate");
const bulkParseBtn = $("bulkParse");
const bulkApplyBtn = $("bulkApply");
const bulkPreview = $("bulkPreview");
const bulkStatus = $("bulkStatus");
const bulkSpinner = $("bulkSpinner");

const filterDateEl = $("filterDate");
const loadByDateBtn = $("loadByDate");
const listEl = $("wordList");
const searchEl = $("search");
const sortEl = $("sort");
const btnQuiz = $("btnQuiz");
const btnStats = $("btnStats");

const quizModeSel = $("quizMode");
const qWrongOnly = $("qWrongOnly");

/* 퀴즈 모달 */
const quizModal=$("quizModal"), quizClose=$("quizClose"), qCount=$("qCount"), qScore=$("qScore"), qWord=$("qWord"), qChoices=$("qChoices"), qNext=$("qNext"), qRestart=$("qRestart");
/* 주관식 입력 */
const qInputWrap=$("qInputWrap"), qInput=$("qInput"), qSubmit=$("qSubmit");
/* 통계 모달 */
const statsModal=$("statsModal"), statsClose=$("statsClose"), stTotal=$("stTotal"), stAcc=$("stAcc"), stToday=$("stToday"), weakList=$("weakList"), recentList=$("recentList");

/* ====== 상태 ====== */
let words=[];                 
let currentFilterDate="";     
let currentQuery="";
let bulkParsed=[];

let quizState = { pool:[], idx:0, score:0, wrongIds:[], mode:"en2ko" };

/* ====== 초기값 ====== */
if (regDateEl) regDateEl.value = today();
if (bulkDateEl) bulkDateEl.value = today();
if (filterDateEl) filterDateEl.value = today();

if(bulkSection){
    bulkSection.classList.add("hidden");
}

/* ====== 토글: 대량 등록 열기/닫기 ====== */
toggleBulk?.addEventListener("click", () => {
  //bulkSection.classList.toggle("hidden");
  //toggleBulk.textContent = bulkSection.classList.contains("hidden") ? "열기" : "닫기";
   const isHidden = bulkSection.classList.toggle("hidden");
    toggleBulk.textContent = isHidden ? "열기" : "닫기";
});

/* ====== 서버에서 목록 로드 ====== */
async function loadWords({date, q}={}){
  const params = new URLSearchParams();
  if(date) params.set("date", date);
  if(q) params.set("q", q);
  const url = "/api/words" + (params.toString()?`?${params.toString()}`:"");
  words = await jget(url);
  render();
}

/* ====== 발음 ====== */
function speakWord(word, voice="female"){
  if(!("speechSynthesis" in window)) { alert("이 브라우저는 음성합성을 지원하지 않아요."); return; }
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.95;
  u.pitch = voice==="male"?0.8:1.2;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/* ====== 렌더 ====== */
function render(){
  let arr = [...words];
  const q = (searchEl?.value || "").trim().toLowerCase();
  if(q) arr = arr.filter(it => it.word.toLowerCase().includes(q) || (it.meaning||"").toLowerCase().includes(q));
  const sort = (sortEl?.value || "created_desc");
  if(sort==="created_desc") arr.sort((a,b)=> (b.id||0)-(a.id||0));
  if(sort==="alpha_asc")   arr.sort((a,b)=> a.word.localeCompare(b.word));
  if(sort==="alpha_desc")  arr.sort((a,b)=> b.word.localeCompare(a.word));

  listEl.innerHTML = "";
  arr.forEach(it=>{
    const total=(it.correct||0)+(it.wrong||0);
    const acc = total? Math.round((it.correct||0)*100/total):0;
    const li = document.createElement("li");
    li.className="word-card";
    li.innerHTML = `
      <h3>${esc(it.word)}</h3>
      <p><strong>뜻</strong> ${esc(it.meaning)}</p>
      ${it.example?`<p><strong>예문</strong> ${esc(it.example)}</p>`:""}
      <div class="meta">
        <span>등록일 ${esc(it.registered_on || "")}</span>
        <span>정답률 ${acc}% (${it.correct||0}/${total||0})</span>
      </div>
      <div class="row gap">
        <button class="ghost sm btn-speak" data-word="${esc(it.word)}">🔊 발음</button>
        <button class="ghost sm danger btn-del" data-id="${it.id}">삭제</button>
      </div>
    `;
    listEl.appendChild(li);

    li.querySelector(".btn-speak")?.addEventListener("click", (e)=>{
      speakWord(e.currentTarget.getAttribute("data-word"));
    });
    li.querySelector(".btn-del")?.addEventListener("click", async (e)=>{
      if(!confirm("정말 삭제할까요?")) return;
      await fetch(`/api/words/${e.currentTarget.getAttribute("data-id")}`, { method: "DELETE" });
      await loadWords({date: currentFilterDate});
    });
  });
}

/* ====== 단일 등록 ====== */
form?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const payload = {
    word: (wordEl.value||"").trim(),
    meaning: (meaningEl.value||"").trim(),
    example: (exampleEl.value||"").trim(),
    level: 1,
    registered_on: regDateEl?.value || today(),
  };
  if(!payload.word || !payload.meaning){ alert("단어와 뜻을 입력하세요."); return; }
  await jpost("/api/words", payload);
  alert("등록되었습니다.");
  form.reset();
  if (regDateEl) regDateEl.value = today();
  await loadWords({date: currentFilterDate});
});

/* ====== 날짜 조회 ====== */
loadByDateBtn?.addEventListener("click", async ()=>{
  currentFilterDate = filterDateEl?.value || "";
  await loadWords({date: currentFilterDate, q: currentQuery});
});
searchEl?.addEventListener("input", ()=> render());
sortEl?.addEventListener("change", ()=> render());

/* ====== 대량 등록 ====== */
function parseBulkText(text){
  return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(row=>{
    const [left, example=""] = row.split("|").map(s=>s.trim());
    const m = left.split(/[-:]/);
    if(m.length<2) return null;
    return {word:m[0].trim(), meaning:m.slice(1).join("-").trim(), example};
  }).filter(Boolean);
}
function renderBulkPreview(list){
  bulkPreview.innerHTML="";
  list.forEach(it=>{
    const li = document.createElement("li");
    li.className="weak-item";
    li.innerHTML = `<div><strong>${esc(it.word)}</strong> <span class="badge">${esc(it.meaning)}</span></div>${it.example?`<div>${esc(it.example)}</div>`:""}`;
    bulkPreview.appendChild(li);
  });
  bulkApplyBtn.disabled = list.length===0;
}
bulkParseBtn?.addEventListener("click", ()=>{
  bulkParsed = parseBulkText(bulkInput.value);
  renderBulkPreview(bulkParsed);
  bulkStatus.textContent = bulkParsed.length ? `인식된 항목: ${bulkParsed.length}개` : `항목이 없습니다.`;
});
bulkApplyBtn?.addEventListener("click", async ()=>{
  if (!bulkParsed.length) return;
  const d = bulkDateEl?.value || today();
  bulkApplyBtn.disabled = true; bulkSpinner.classList.remove("hidden");
  try{
    const res = await jpost("/api/words/bulk", { items: bulkParsed.map(it=>({...it, registered_on:d})) });
    bulkStatus.textContent = `완료: ${res.inserted}개 등록`;
  }finally{
    bulkSpinner.classList.add("hidden");
    bulkInput.value=""; bulkParsed=[]; renderBulkPreview([]);
    await loadWords({date: currentFilterDate});
  }
});

/* ====== 퀴즈 ====== */
btnQuiz?.addEventListener("click", async ()=>{
  const d = filterDateEl?.value || "";
  const pool = await jget(`/api/quiz${d?`?date=${d}`:""}`);
  if(pool.length<4){ alert("퀴즈는 단어가 최소 4개 이상 필요해요."); return; }
  quizState.pool = shuffle(pool).slice(0, 100);
  quizState.idx=0; quizState.score=0; quizState.wrongIds=[];
  quizState.mode = quizModeSel?.value || "en2ko";
  qWrongOnly.disabled = true;
  quizModal.classList.remove("hidden");
  nextQuestion();
});
qWrongOnly?.addEventListener("click", ()=>{
  if(!quizState.wrongIds.length) return;
  quizState.pool = shuffle(words.filter(w=> quizState.wrongIds.includes(w.id)));
  quizState.idx=0; quizState.score=0; quizState.wrongIds = [];
  qWrongOnly.disabled = true;
  nextQuestion();
});
quizClose?.addEventListener("click", ()=> quizModal.classList.add("hidden"));
qRestart?.addEventListener("click", ()=>{ quizState.idx=0; quizState.score=0; nextQuestion(); });
qNext?.addEventListener("click", ()=>{ quizState.idx++; nextQuestion(); });

qSubmit?.addEventListener("click", ()=>{
  const answer = (qInput.value||"").trim().toLowerCase();
  const correct = quizState.pool[quizState.idx];
  let isCorrect = false;
  if(quizState.mode.includes("en")) isCorrect = answer === correct.word.toLowerCase();
  else isCorrect = answer === correct.meaning.toLowerCase();
  if(isCorrect){
    quizState.score++;
    jpost(`/api/words/${correct.id}/result`, {correct:true});
    alert("정답!");
  }else{
    quizState.wrongIds.push(correct.id);
    jpost(`/api/words/${correct.id}/result`, {correct:false});
    alert(`오답! 정답은 ${quizState.mode.includes("en")?correct.word:correct.meaning}`);
  }
  qInput.value="";
  qNext.disabled=false;
});


/* 퀴즈모드 관련 내용 일단 주석처리.
function nextQuestion(){
  qChoices.innerHTML=""; qNext.disabled=true; qInputWrap.classList.add("hidden");
  const total = quizState.pool.length;
  if(quizState.idx>=total){ qWord.textContent=`완료! 점수 ${quizState.score}/${total}`; return; }
  const correct = quizState.pool[quizState.idx];
  const others = shuffle(quizState.pool.filter(w=>w.id!==correct.id)).slice(0,3);


  if(quizState.mode==="en2ko"){
    qWord.textContent = correct.word;
    shuffle([correct,...others]).forEach(opt=> addChoice(opt.meaning, opt.id===correct.id));
  }else if(quizState.mode==="ko2en"){
    qWord.textContent = correct.meaning;
    shuffle([correct,...others]).forEach(opt=> addChoice(opt.word, opt.id===correct.id));
  }else if(quizState.mode==="cloze"){
    qWord.textContent = (correct.example||`${correct.word} is ...`).replace(new RegExp(correct.word,"ig"),"_____");
    shuffle([correct,...others]).forEach(opt=> addChoice(opt.word, opt.id===correct.id));
  }else if(quizState.mode.includes("essay")){ // 주관식 모드
    qWord.textContent = quizState.mode==="essay_en2ko" ? correct.word : correct.meaning;
    qInputWrap.classList.remove("hidden");
  }
  qCount.textContent = `${quizState.idx+1}/${total}`;
  qScore.textContent = `점수 ${quizState.score}`;
}
 */
function nextQuestion(){
  qChoices.innerHTML = "";
  qNext.disabled = true;

  // 항상 주관식 입력창 숨김
  qInputWrap.classList.add("hidden");

  const total = quizState.pool.length;
  if(quizState.idx >= total){
    qWord.textContent = `완료! 최종 점수: ${quizState.score} / ${total}`;
    qCount.textContent = `${total}/${total}`;
    qWrongOnly.disabled = quizState.wrongIds.length === 0;
    return;
  }

  const correct = quizState.pool[quizState.idx];
  const mode = quizState.mode;
  const others = shuffle(quizState.pool.filter(w => w.id !== correct.id)).slice(0,3);
  let options = [];

  if(mode === "en2ko"){ // 영어 → 한국어 (선택형)
    qWord.textContent = correct.word;
    options = shuffle([correct, ...others]);
    options.forEach(opt => addChoice(opt.meaning, opt.id === correct.id));
  }
  else if(mode === "ko2en"){ // 한국어 → 영어 (선택형)
    qWord.textContent = correct.meaning;
    options = shuffle([correct, ...others]);
    options.forEach(opt => addChoice(opt.word, opt.id === correct.id));
  }
  else if(mode === "cloze"){ // 빈칸 채우기 (선택형)
    const sentence = (correct.example || `${correct.word} is ...`)
      .replace(new RegExp(correct.word, "ig"), "_____");
    qWord.textContent = sentence;
    options = shuffle([correct, ...others]);
    options.forEach(opt => addChoice(opt.word, opt.id === correct.id));
  }
  else if(mode === "en2ko_input"){   // 영어 → 한국어 (주관식)
    qWord.textContent = correct.word;
    qInputWrap.classList.remove("hidden");
    qSubmit.onclick = ()=>checkInputAnswer(correct.meaning, correct.id);
  }
  else if(mode === "ko2en_input"){   // 한국어 → 영어 (주관식)
    qWord.textContent = correct.meaning;
    qInputWrap.classList.remove("hidden");
    qSubmit.onclick = ()=>checkInputAnswer(correct.word, correct.id);
  }
  else if(mode === "cloze_input"){   // ✅ 빈칸 채우기 (주관식)
    const sentence = (correct.example || `${correct.word} is ...`)
         .replace(new RegExp(correct.word, "ig"), "_____");
     qWord.textContent = sentence;
     qInputWrap.classList.remove("hidden");
     qInput.placeholder = "정답 단어(영어) 입력";
     qSubmit.onclick = ()=>checkInputAnswer(correct.word, correct.id);
}

  qCount.textContent = `${quizState.idx+1}/${total}`;
  qScore.textContent = `점수 ${quizState.score}`;
}




function checkInputAnswer(answer, wid){
  const user = ($("qInput").value || "").trim().toLowerCase();
  const target = (answer||"").trim().toLowerCase();
  $("qInput").value="";

  if(user === target){
    alert("정답!");
    quizState.score++;
    jpost(`/api/words/${wid}/result`, {correct: true});
  } else {
    alert(`오답! 정답: ${answer}`);
    quizState.wrongIds.push(wid);
    jpost(`/api/words/${wid}/result`, {correct: false});
  }
  qScore.textContent = `점수 ${quizState.score}`;
  qNext.disabled=false;
}



function addChoice(label, isCorrect){
  const div=document.createElement("div");
  div.className="choice"; div.textContent=label;
  div.addEventListener("click", async ()=>{
    [...qChoices.children].forEach(el=>el.classList.add("disabled"));
    if(isCorrect){ div.classList.add("correct"); quizState.score++; await jpost(`/api/words/${quizState.pool[quizState.idx].id}/result`, {correct:true}); }
    else{ div.classList.add("wrong"); quizState.wrongIds.push(quizState.pool[quizState.idx].id); }
    qScore.textContent = `점수 ${quizState.score}`; qNext.disabled=false;
  });
  qChoices.appendChild(div);
}

/* ====== 통계 ====== */
btnStats?.addEventListener("click", async ()=>{
  const to = today();
  const from = new Date(Date.now()-29*24*60*60*1000).toISOString().slice(0,10);
  const rows = await jget(`/api/stats/daily?from=${from}&to=${to}`);
  const totalWords = rows.reduce((a,r)=>a+r.words,0);
  const sumCorrect = rows.reduce((a,r)=>a+(r.correct||0),0);
  const sumWrong = rows.reduce((a,r)=>a+(r.wrong||0),0);
  const attempts = sumCorrect + sumWrong;
  stTotal.textContent = totalWords; stAcc.textContent = attempts?`${Math.round(sumCorrect*100/attempts)}%`:"0%";
  const todayRow = rows.find(r=>r.day===to); stToday.textContent = todayRow? todayRow.words:0;
  statsModal.classList.remove("hidden");
});
statsClose?.addEventListener("click", ()=> statsModal.classList.add("hidden"));

/* ====== 최초 로드 ====== */
currentFilterDate = filterDateEl?.value || "";
loadWords({date: currentFilterDate}).catch(()=> alert("목록을 불러오지 못했습니다."));



from flask import Flask, jsonify
import pymysql, os

app = Flask(__name__)

def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "user"),
        password=os.getenv("DB_PASS", "pass"),
        db=os.getenv("DB_NAME", "english"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )

@app.route("/api/word-dates")
def api_word_dates():
    # 서버 시간이 UTC라면 아래 tz_sql 사용, KST라면 tz_sql을 date_sql로 바꿔 쓰세요.
    tz_sql = """
      SELECT DATE(CONVERT_TZ(created_at,'UTC','Asia/Seoul')) AS d, COUNT(*) AS cnt
      FROM words
      GROUP BY DATE(CONVERT_TZ(created_at,'UTC','Asia/Seoul'))
      ORDER BY d
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(tz_sql)
        rows = cur.fetchall()

    dates = [r["d"].strftime("%Y-%m-%d") for r in rows]
    by_count = {r["d"].strftime("%Y-%m-%d"): int(r["cnt"]) for r in rows}
    return jsonify({"dates": dates, "byCount": by_count})

// ===== [추가] HERO 검색 → 기존 검색(#search)로 위임 =====
// - 기존 검색 로직/렌더 함수 변경 없이, 값만 주입 후 render()를 호출합니다.
document.getElementById('searchForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const v = document.getElementById('searchInput')?.value || '';
  const searchEl = document.getElementById('search');
  if (searchEl) {
    searchEl.value = v;   // 기존 검색 인풋에 값 반영
    if (typeof render === 'function') render(); // 기존 렌더 재사용
  }
});

// ===== [추가] 등록일 캘린더 표시 (기존 기능 보존) =====
(function(){
  let regSet = new Set();         // "YYYY-MM-DD"
  let regCount = {};              // {"YYYY-MM-DD": number}
  let calY, calM;
  const WEEK = ['일','월','화','수','목','금','토'];

  async function loadDates(){
    try{
      const r = await fetch('/api/word-dates', { cache:'no-store' });
      if(!r.ok) throw new Error('failed');
      const j = await r.json();
      regSet = new Set(j.dates || []);
      regCount = j.byCount || {};
    }catch(e){
      // 실패 시 캘린더만 비워둡니다. 기존 기능 영향 없음.
      regSet = new Set(); regCount = {};
      console.warn('calendar: load failed', e);
    }
  }

  function renderCal(y,m){
    const el = document.getElementById('calendarContainer');
    if(!el) return;
    el.innerHTML = '';

    // 요일 헤더
    WEEK.forEach(w=>{
      const h = document.createElement('div');
      h.className = 'weekday'; h.textContent = w; el.appendChild(h);
    });

    const first = new Date(y,m,1);
    const pad = first.getDay();
    const days = new Date(y,m+1,0).getDate();

    for(let i=0;i<pad;i++){
      const d=document.createElement('div');
      d.className='day empty'; el.appendChild(d);
    }
    for(let d=1; d<=days; d++){
      const mm = String(m+1).padStart(2,'0');
      const dd = String(d).padStart(2,'0');
      const key = `${y}-${mm}-${dd}`;

      const cell = document.createElement('div');
      cell.className='day';
      cell.innerHTML = `<span class="num">${d}</span>`;

      if(regSet.has(key)){
        cell.classList.add('marked');
        const c = regCount[key] || 1;
        const lv = c>=6?3:(c>=3?2:1);
        cell.dataset.level = String(lv);
      }
      el.appendChild(cell);
    }
    const lbl = document.getElementById('calLabel');
    if(lbl) lbl.textContent = `${y}.${String(m+1).padStart(2,'0')}`;
  }

  function bindNav(){
    document.getElementById('prevMonthBtn')?.addEventListener('click', ()=>{
      calM -= 1; if(calM<0){ calM=11; calY-=1; }
      renderCal(calY,calM);
    });
    document.getElementById('nextMonthBtn')?.addEventListener('click', ()=>{
      calM += 1; if(calM>11){ calM=0; calY+=1; }
      renderCal(calY,calM);
    });
  }

  // 독립 초기화 (기존 초기화와 분리)
  (async function initCal(){
    await loadDates();
    const t = new Date();
    calY = t.getFullYear(); calM = t.getMonth();
    renderCal(calY,calM);
    bindNav();
  })();
})();
