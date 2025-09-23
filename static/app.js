/* ===================== 공통 유틸 ===================== */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function shuffle(a){ for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function today(){ return new Date().toISOString().slice(0,10); }
async function jget(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function jpost(url, body){ const r=await fetch(url,{method:"POST",headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body)}); if(!r.ok) throw new Error(await r.text()); return r.json(); }

/* ===================== 엘리먼트(현재 UI와 1:1 매칭) ===================== */
// 검색
const searchForm = $("searchForm");
const searchInput = $("searchInput");

// 단일 등록 패널
const singlePanel = $("singlePanel");
const wordForm = $("wordForm");
const wordEl = $("word");
const meaningEl = $("meaning");
const exampleEl = $("example");
const regDateEl = $("regDate");

// 대량 등록 패널
const bulkPanel = $("bulkPanel");
const bulkInput = $("bulkInput");
const bulkDateEl = $("bulkDate");
const bulkParseBtn = $("bulkParse");
const bulkApplyBtn = $("bulkApply");
const bulkPreview = $("bulkPreview");
const bulkStatus = $("bulkStatus");
const bulkSpinner = $("bulkSpinner");

// 메뉴 버튼
const openSingleAdd = $("openSingleAdd");
const openBulk = $("openBulk");
const openMCQ = $("openMCQ");
const openSAQ = $("openSAQ");

// 목록
const listEl = $("wordList");

// 퀴즈 모달
const quizModal=$("quizModal"), quizClose=$("quizClose"),
      qCount=$("qCount"), qScore=$("qScore"), qWord=$("qWord"),
      qChoices=$("qChoices"), qNext=$("qNext"), qRestart=$("qRestart"),
      qWrongOnly=$("qWrongOnly"), qInputWrap=$("qInputWrap"),
      qInput=$("qInput"), qSubmit=$("qSubmit");

// 모드 시트
const modeSheet=$("modeSheet"), modeTitle=$("modeTitle"),
      modeButtons=$("modeButtons"), modeCancel=$("modeCancel");

/* ===================== 상태 ===================== */
let words=[];                      // 현재 리스트
let currentFilterDate="";          // 달력 클릭 시 선택된 날짜(YYYY-MM-DD)
let regSet = new Set();            // 달력 마킹 날짜 집합
let regCount = {};                 // 날짜별 단어 수
let calY, calM;                    // 달력 년/월
let bulkParsed=[];                 // 대량 파싱 결과

const WEEK = ['일','월','화','수','목','금','토'];

let quizState = {
  pool: [], idx: 0, score: 0, wrongIds: [], mode: "en2ko"
};

/* ===================== 공통 동작 ===================== */
// 전역 검색
searchForm?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const q = (searchInput?.value || "").trim();
  await loadWords({ q });
  scrollToList();
});

// 메뉴 토글
openSingleAdd?.addEventListener("click", ()=>{
  singlePanel.classList.toggle("hidden");
  bulkPanel.classList.add("hidden");
});
openBulk?.addEventListener("click", ()=>{
  bulkPanel.classList.toggle("hidden");
  singlePanel.classList.add("hidden");
});

// 기본 날짜 세팅
if (regDateEl) regDateEl.value = today();
if (bulkDateEl) bulkDateEl.value = today();

/* ===================== 목록 로드/렌더 ===================== */
async function loadWords({date, q}={}){
  const p = new URLSearchParams();
  if(date) p.set("date", date);
  if(q) p.set("q", q);
  const url = "/api/words" + (p.toString()?`?${p.toString()}`:"");
  words = await jget(url);
  renderList();
}

function speakWord(word, voice="female"){
  if(!("speechSynthesis" in window)){ alert("브라우저가 음성합성을 지원하지 않아요."); return; }
  const u = new SpeechSynthesisUtterance(word);
  u.lang="en-US"; u.rate=0.95; u.pitch = voice==="male"?0.85:1.15;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function renderList(){
  listEl.innerHTML = "";
  words.forEach(it=>{
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
      await fetch(`/api/words/${e.currentTarget.getAttribute("data-id")}`, { method:"DELETE" });
      await loadWords({date: currentFilterDate});
      await loadDates(); renderCal(calY,calM);
    });
  });
}

function scrollToList(){
  listEl?.scrollIntoView({ behavior:"smooth", block:"start" });
}

/* ===================== 단일 등록 ===================== */
wordForm?.addEventListener("submit", async (e)=>{
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
  wordForm.reset();
  if (regDateEl) regDateEl.value = today();
  await loadWords({date: currentFilterDate});
  await loadDates(); renderCal(calY,calM);
});

/* ===================== 대량 등록 ===================== */
function parseBulk(text){
  return text
    .split(/\r?\n/)
    .map(s=>s.trim())
    .filter(Boolean)
    .map(row=>{
      // "apple - 사과 | I like an apple."
      const [left, example=""] = row.split("|").map(s=>s.trim());
      const m = left.split(/[-:]/);                   // apple - 사과
      if(m.length<2) return null;
      return { word:m[0].trim(), meaning:m.slice(1).join("-").trim(), example };
    })
    .filter(Boolean);
}

function renderBulkPreview(list){
  bulkPreview.innerHTML = "";
  list.forEach(it=>{
    const li=document.createElement("li");
    li.className="weak-item";
    li.innerHTML = `<div><strong>${esc(it.word)}</strong> <span class="badge">${esc(it.meaning)}</span></div>${it.example?`<div>${esc(it.example)}</div>`:""}`;
    bulkPreview.appendChild(li);
  });
  bulkApplyBtn.disabled = list.length===0;
}

bulkParseBtn?.addEventListener("click", ()=>{
  bulkParsed = parseBulk(bulkInput.value);
  renderBulkPreview(bulkParsed);
  bulkStatus.textContent = bulkParsed.length ? `인식된 항목: ${bulkParsed.length}개` : `항목이 없습니다.`;
});

bulkApplyBtn?.addEventListener("click", async ()=>{
  if(!bulkParsed.length) return;
  const d = bulkDateEl?.value || today();
  bulkApplyBtn.disabled = true; bulkSpinner.classList.remove("hidden");
  try{
    const res = await jpost("/api/words/bulk", { items: bulkParsed.map(it=>({...it, registered_on:d})) });
    bulkStatus.textContent = `완료: ${res.inserted}개 등록`;
  }finally{
    bulkSpinner.classList.add("hidden");
    bulkInput.value=""; bulkParsed=[]; renderBulkPreview([]);
    await loadWords({date: currentFilterDate});
    await loadDates(); renderCal(calY,calM);
  }
});

/* ===================== 달력 ===================== */
async function loadDates(){
  try{
    const j = await jget('/api/word-dates');   // {dates:[...], byCount:{...}}
    regSet = new Set(j.dates || []);
    regCount = j.byCount || {};
  }catch(e){
    console.warn("[calendar] loadDates failed:", e);
    regSet = new Set(); regCount = {};
  }
}

function renderCal(y,m){
  const el = $("calendarContainer");
  if(!el) return;
  el.innerHTML = "";

  // 요일 헤더
  WEEK.forEach(w=>{
    const h=document.createElement("div");
    h.className="weekday"; h.textContent=w;
    el.appendChild(h);
  });

  const first = new Date(y,m,1);
  const pad   = first.getDay();
  const days  = new Date(y,m+1,0).getDate();

  for(let i=0;i<pad;i++){
    const d=document.createElement("div");
    d.className="day empty";
    el.appendChild(d);
  }
  for(let d=1; d<=days; d++){
    const mm = String(m+1).padStart(2,'0');
    const dd = String(d).padStart(2,'0');
    const key = `${y}-${mm}-${dd}`;

    const cell = document.createElement("div");
    cell.className="day";
    cell.innerHTML = `<span class="num">${d}</span>`;

    if(regSet.has(key)){
      cell.classList.add("marked");
      const c = regCount[key] || 1;
      const lv = c>=6?3:(c>=3?2:1);
      cell.dataset.level = String(lv);
    }
    cell.addEventListener("click", async ()=>{
      currentFilterDate = key;
      await loadWords({ date:key });
      scrollToList();
    });

    el.appendChild(cell);
  }

  const lbl = $("calLabel");
  if(lbl) lbl.textContent = `${y}년 ${m+1}월`;
}

function bindCalNav(){
  $("prevMonthBtn")?.addEventListener("click", ()=>{
    calM -= 1; if(calM<0){ calM=11; calY-=1; }
    renderCal(calY,calM);
  });
  $("nextMonthBtn")?.addEventListener("click", ()=>{
    calM += 1; if(calM>11){ calM=0; calY+=1; }
    renderCal(calY,calM);
  });
}

/* ===================== 퀴즈(모드 선택 → 진행) ===================== */
function openModeSheet(type){
  modeTitle.textContent = (type==='mcq') ? '객관식 모드 선택' : '주관식 모드 선택';
  modeButtons.innerHTML = '';
  const modes = (type==='mcq')
    ? [{k:'en2ko',t:'영→한'},{k:'ko2en',t:'한→영'},{k:'cloze',t:'빈칸'}]
    : [{k:'en2ko_input',t:'영→한:주관식'},{k:'ko2en_input',t:'한→영:주관식'},{k:'cloze_input',t:'빈칸:주관식'}];

  modes.forEach(m=>{
    const b=document.createElement('button');
    b.textContent=m.t;
    b.addEventListener('click', ()=> startQuiz(m.k));
    modeButtons.appendChild(b);
  });
  modeSheet.classList.remove('hidden');
}
modeCancel?.addEventListener('click', ()=> modeSheet.classList.add('hidden'));
openMCQ?.addEventListener('click', ()=> openModeSheet('mcq'));
openSAQ?.addEventListener('click', ()=> openModeSheet('saq'));

async function startQuiz(mode){
  modeSheet.classList.add('hidden');
  const d = currentFilterDate || '';
  const pool = await jget(`/api/quiz${d?`?date=${d}`:""}`);
  if(pool.length<1){ alert("출제할 단어가 없습니다."); return; }
  quizState.pool = shuffle(pool).slice(0, 100);
  quizState.idx=0; quizState.score=0; quizState.wrongIds=[]; quizState.mode=mode;
  qWrongOnly.disabled=true;
  quizModal.classList.remove("hidden");
  nextQuestion();
}

quizClose?.addEventListener("click", ()=> quizModal.classList.add("hidden"));
qRestart?.addEventListener("click", ()=>{ quizState.idx=0; quizState.score=0; nextQuestion(); });
qNext?.addEventListener("click", ()=>{ quizState.idx++; nextQuestion(); });
qWrongOnly?.addEventListener("click", ()=>{
  if(!quizState.wrongIds.length) return;
  quizState.pool = shuffle(words.filter(w=> quizState.wrongIds.includes(w.id)));
  quizState.idx=0; quizState.score=0; quizState.wrongIds=[]; qWrongOnly.disabled=true;
  nextQuestion();
});

function addChoice(label, isCorrect){
  const div=document.createElement("div");
  div.className="choice"; div.textContent=label;
  div.addEventListener("click", async ()=>{
    [...qChoices.children].forEach(el=>el.classList.add("disabled"));
    const cur = quizState.pool[quizState.idx];
    if(isCorrect){ div.classList.add("correct"); quizState.score++; await jpost(`/api/words/${cur.id}/result`, {correct:true}); }
    else{ div.classList.add("wrong"); quizState.wrongIds.push(cur.id); await jpost(`/api/words/${cur.id}/result`, {correct:false}); }
    qScore.textContent = `점수 ${quizState.score}`; qNext.disabled=false;
  });
  qChoices.appendChild(div);
}

function nextQuestion(){
  qChoices.innerHTML=""; qNext.disabled=true; qInputWrap.classList.add("hidden");
  const total = quizState.pool.length;
  if(quizState.idx >= total){
    qWord.textContent = `완료! 최종 점수: ${quizState.score} / ${total}`;
    qCount.textContent = `${total}/${total}`;
    qWrongOnly.disabled = quizState.wrongIds.length===0;
    return;
  }
  const cur = quizState.pool[quizState.idx];
  const mode = quizState.mode;
  const others = shuffle(quizState.pool.filter(w=>w.id!==cur.id)).slice(0,3);

  if(mode==="en2ko"){
    qWord.textContent = cur.word;
    shuffle([cur,...others]).forEach(opt=> addChoice(opt.meaning, opt.id===cur.id));
  }else if(mode==="ko2en"){
    qWord.textContent = cur.meaning;
    shuffle([cur,...others]).forEach(opt=> addChoice(opt.word, opt.id===cur.id));
  }else if(mode==="cloze"){
    const sentence = (cur.example || `${cur.word} is ...`).replace(new RegExp(cur.word,"ig"),"_____");
    qWord.textContent = sentence;
    shuffle([cur,...others]).forEach(opt=> addChoice(opt.word, opt.id===cur.id));
  }else if(mode==="en2ko_input"){
    qWord.textContent = cur.word; qInputWrap.classList.remove("hidden");
    qInput.placeholder="뜻 입력"; qSubmit.onclick=()=>checkInputAnswer(cur.meaning, cur.id);
  }else if(mode==="ko2en_input"){
    qWord.textContent = cur.meaning; qInputWrap.classList.remove("hidden");
    qInput.placeholder="단어 입력(영어)"; qSubmit.onclick=()=>checkInputAnswer(cur.word, cur.id);
  }else if(mode==="cloze_input"){
    const sentence = (cur.example || `${cur.word} is ...`).replace(new RegExp(cur.word,"ig"),"_____");
    qWord.textContent = sentence; qInputWrap.classList.remove("hidden");
    qInput.placeholder="정답 단어(영어)"; qSubmit.onclick=()=>checkInputAnswer(cur.word, cur.id);
  }

  qCount.textContent = `${quizState.idx+1}/${total}`;
  qScore.textContent = `점수 ${quizState.score}`;
}

function checkInputAnswer(answer, wid){
  const user=(qInput.value||"").trim().toLowerCase();
  const target=(answer||"").trim().toLowerCase();
  qInput.value="";
  if(user===target){ alert("정답!"); quizState.score++; jpost(`/api/words/${wid}/result`, {correct:true}); }
  else{ alert(`오답! 정답: ${answer}`); quizState.wrongIds.push(wid); jpost(`/api/words/${wid}/result`, {correct:false}); }
  qScore.textContent = `점수 ${quizState.score}`; qNext.disabled=false;
}

/* ===================== 최초 초기화 ===================== */
(async function init(){
  try{
    await loadWords({});
  }catch(e){
    console.warn("[init] loadWords failed:", e);
  }finally{
    try{ await loadDates(); }catch(e){ console.warn("[init] loadDates failed:", e); }
    const t=new Date(); calY=t.getFullYear(); calM=t.getMonth();
    renderCal(calY,calM);
    bindCalNav();
  }
})();
