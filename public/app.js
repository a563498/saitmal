const $ = (id)=>document.getElementById(id);

const els = {
  triesCount: $("triesCount"),
  elapsed: $("elapsed"),
  bestPct: $("bestPct"),
  streak: $("streak"),
  pb: $("pb"),
  dateKey: $("dateKey"),
  msg: $("msg"),
  form: $("guessForm"),
  input: $("guessInput"),
  list: $("guessList"),
  newGame: $("newGameBtn"),
  giveUp: $("giveUpBtn"),
  themeBtn: $("themeBtn"),
  shareBtn: $("shareBtn"),
};


function toast(msg){
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(), 1800);
}

function dayKeyToDate(k){
  // YYYY-MM-DD
  const [y,m,d] = String(k).split("-").map(Number);
  if (!y||!m||!d) return null;
  return new Date(y, m-1, d);
}

function calcStreak(){
  // 연속 '승리' 스트릭 (포기/미완료는 끊김)
  const keys = Object.keys(localStorage).filter(k=>k.startsWith("tteutgyeop_daily_"));
  const days = keys.map(k=>k.replace("tteutgyeop_daily_","")).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k));
  const map = new Map();
  for (const dk of days){
    try{
      const s = JSON.parse(localStorage.getItem("tteutgyeop_daily_"+dk));
      if (s && s.dateKey === dk) map.set(dk, s);
    }catch{}
  }
  // compute from latest day backwards
  const sorted = [...map.keys()].sort(); // ascending
  if (!sorted.length) return 0;

  let streak = 0;
  // start from today if exists else latest recorded
  const startKey = meta?.dateKey && map.has(meta.dateKey) ? meta.dateKey : sorted[sorted.length-1];

  let cur = dayKeyToDate(startKey);
  while (cur){
    const dk = cur.toISOString().slice(0,10);
    const s = map.get(dk);
    if (!s || !s.finished || s.gaveUp) break;
    streak += 1;
    // previous day
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()-1);
  }
  return streak;
}

function personalBest(){
  // 개인 최고: (가장 적은 시도, 동률이면 가장 빠른 시간)
  const keys = Object.keys(localStorage).filter(k=>k.startsWith("tteutgyeop_daily_"));
  let best = null;
  for (const k of keys){
    try{
      const s = JSON.parse(localStorage.getItem(k));
      if (!s || !s.finished || s.gaveUp) continue;
      const tries = (s.guesses||[]).length;
      const time = (s.finishedAt||0) - (s.startedAt||0);
      if (!best || tries < best.tries || (tries===best.tries && time < best.time)){
        best = { tries, time };
      }
    }catch{}
  }
  if (!best) return "-";
  return `${best.tries}T/${fmtElapsed(best.time)}`;
}

function shareText(){
  if (!state) return null;
  const tries = state.guesses.length;
  const time = (state.finishedAt||nowMs()) - (state.startedAt||nowMs());
  const head = `뜻겹 ${state.dateKey} ${state.gaveUp ? "포기" : tries+"회"} (${fmtElapsed(time)})`;
  // create emoji bar list for top 6 guesses by similarity
  const sorted = [...state.guesses].sort((a,b)=>(b.pct||0)-(a.pct||0)).slice(0,6);
  const line = (p)=>{
    if (p>=90) return "🟩🟩🟩";
    if (p>=70) return "🟨🟨🟨";
    if (p>=40) return "🟥🟥🟥";
    return "⬛⬛⬛";
  };
  const rows = sorted.map(g=>`${line(g.pct||0)} ${g.word} ${g.pct}%`);
  return [head, ...rows].join("\n");
}

let meta = null;
let state = null;
let timer = null;

function nowMs(){ return Date.now(); }
function pad2(n){ return String(n).padStart(2,"0"); }
function fmtElapsed(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const mm = Math.floor(s/60);
  const ss = s%60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

function normWord(s){
  return String(s||"").normalize("NFKC")
    .replace(/[·ㆍ\u00B7\u318D\u2027]/g,"")
    .replace(/[-‐-‒–—]/g,"")
    .replace(/\s+/g,"");
}

function storageKey(dateKey){ return `tteutgyeop_daily_${dateKey}`; }

function loadState(dateKey){
  try{
    const raw = localStorage.getItem(storageKey(dateKey));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.dateKey !== dateKey) return null;
    return s;
  }catch{ return null; }
}

function saveState(){
  if (!state || !state.dateKey) return;
  localStorage.setItem(storageKey(state.dateKey), JSON.stringify(state));
}

function resetState(dateKey){
  state = { dateKey, startedAt: nowMs(), finished:false, gaveUp:false, guesses:[] };
  saveState();
  render();
}

function setMsg(t){ els.msg.textContent = t || ""; }

function pctColor(p){
  if (p>=90) return "var(--good)";
  if (p>=60) return "var(--warn)";
  return "var(--bad)";
}

function clueTexts(cl){
  const out = [];
  if (cl.posMatch) out.push(`품사 같음(${cl.answerPos||cl.pos||"?"})`);
  else if (cl.pos && cl.answerPos) out.push(`품사 다름(${cl.pos} vs ${cl.answerPos})`);

  if (typeof cl.guessLen === "number" && typeof cl.answerLen === "number"){
    if (cl.guessLen === cl.answerLen) out.push(`글자수 같음(${cl.answerLen})`);
    else if (cl.guessLen > cl.answerLen) out.push(`정답보다 김(+${cl.guessLen-cl.answerLen})`);
    else out.push(`정답보다 짧음(-${cl.answerLen-cl.guessLen})`);
  }

  if (cl.choseongMatchCount != null) out.push(`초성 ${cl.choseongMatchCount}글자 일치`);
  return out;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}

function render(){
  if (!meta || !state) return;

  els.dateKey.textContent = `오늘(${state.dateKey})`;
  els.triesCount.textContent = String(state.guesses.length);

  const best = state.guesses.reduce((m,g)=>Math.max(m, g.pct||0), 0);
  els.bestPct.textContent = `${best}%`;
  els.streak.textContent = String(calcStreak());
  els.pb.textContent = personalBest();

  const sorted = [...state.guesses].sort((a,b)=>{
    if ((b.pct||0) !== (a.pct||0)) return (b.pct||0)-(a.pct||0);
    return (b.createdAt||0)-(a.createdAt||0);
  });

  els.list.innerHTML = "";
  if (!sorted.length){
    els.list.innerHTML = `<div class="small">아직 입력이 없어요.</div>`;
  }else{
    for (const g of sorted){
      const item = document.createElement("div");
      item.className = "item";

      const top = document.createElement("div");
      top.className = "itemTop";

      const w = document.createElement("div");
      w.className = "word";
      w.textContent = g.word;

      const sim = document.createElement("div");
      sim.className = "sim";

      const pct = Math.max(0, Math.min(100, g.pct||0));

      const pctEl = document.createElement("div");
      pctEl.className = "simPct";
      pctEl.textContent = `${pct}%`;

      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      fill.className = "barFill";
      fill.style.width = `${pct}%`;
      fill.style.background = pctColor(pct);
      bar.appendChild(fill);

      sim.appendChild(pctEl);
      sim.appendChild(bar);

      top.appendChild(w);
      top.appendChild(sim);

      const pills = document.createElement("div");
      pills.className = "pills";
      const texts = clueTexts(g.clues||{});
      for (const t of (texts.length?texts:["단서 없음"])){
        const p = document.createElement("div");
        p.className = "pill";
        p.textContent = t;
        pills.appendChild(p);
      }

      item.appendChild(top);
      item.appendChild(pills);
      els.list.appendChild(item);
    }
  }

  els.input.disabled = state.finished;
  els.form.querySelector("button[type=submit]").disabled = state.finished;
  els.giveUp.disabled = state.finished;
}

async function fetchMeta(){
  const r = await fetch("/api/meta", { cache:"no-store" });
  const ct = (r.headers.get("content-type")||"").toLowerCase();
  if (!ct.includes("application/json")){
    const t = await r.text();
    throw new Error("API가 JSON이 아닌 HTML로 응답했어요. (Functions 미배포/빌드 실패 가능) /api/meta 응답 시작: " + t.slice(0,60));
  }
  const j = await r.json();
  if (!j.ok) throw new Error(j.message || "meta failed");
  return j;
}

async function guessWord(word){
  const u = new URL("/api/guess", location.origin);
  u.searchParams.set("word", word);
  const r = await fetch(u.toString(), { cache:"no-store" });
  const ct = (r.headers.get("content-type")||"").toLowerCase();
  if (!ct.includes("application/json")){
    const t = await r.text();
    return { ok:false, message:"API가 JSON이 아닌 HTML로 응답했어요. (Functions 미배포/빌드 실패 가능)", detail:t.slice(0,120) };
  }
  return await r.json();
}

function startTimer(){
  if (timer) clearInterval(timer);
  timer = setInterval(()=>{
    if (!state) return;
    els.elapsed.textContent = fmtElapsed(nowMs() - state.startedAt);
  }, 500);
}

function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("tteutgyeop_theme", theme);
  els.themeBtn.textContent = theme === "light" ? "☀️" : "🌙";
}

function initTheme(){
  const saved = localStorage.getItem("tteutgyeop_theme");
  if (saved === "light" || saved === "dark"){
    applyTheme(saved);
  }else{
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    applyTheme(prefersLight ? "light" : "dark");
  }
  els.themeBtn.addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
}

function init(){
  initTheme();

  fetchMeta().then((m)=>{
    meta = m;
    const loaded = loadState(meta.dateKey);
    state = loaded || { dateKey: meta.dateKey, startedAt: nowMs(), finished:false, gaveUp:false, guesses:[] };
    if (!loaded) saveState();
    render();
    startTimer();
    // 첫 진입 안내(1회)
    if (!sessionStorage.getItem('tteutgyeop_seen')){ sessionStorage.setItem('tteutgyeop_seen','1'); toast('유사도 높은 순으로 정렬됩니다'); }
  }).catch((e)=> setMsg(`초기화 실패: ${e.message}`));

  els.form.addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    if (!state || state.finished) return;
    const w = (els.input.value || "").trim();
    if (!w) return;

    setMsg("조회 중…");
    els.input.value = "";

    try{
      const res = await guessWord(w);
      if (!res.ok){ setMsg((res.message || "실패") + (res.detail ? " / " + String(res.detail).slice(0,120) : "")); return; }
      const d = res.data;
      if (!d){ setMsg("응답 형식 오류"); return; }

      const word = (d.word || w).trim();
      const pct = Number(d.similarity);
      if (!Number.isFinite(pct)){ setMsg("유사도 계산 실패"); return; }

      if (state.guesses.some(x=>normWord(x.word) === normWord(word))){
        setMsg("이미 입력한 단어예요.");
        return;
      }

      state.guesses.push({ word, pct, clues: d.clues, createdAt: nowMs() });

      if (d.isCorrect){
        state.finished = true;
        state.finishedAt = nowMs();
        setMsg(`정답! ${state.guesses.length}번째, ${fmtElapsed(nowMs()-state.startedAt)} 걸렸어요.`);
      }else{
        setMsg("");
      }

      saveState();
      render();
    }catch(e){
      setMsg(`오류: ${e.message}`);
    }
  });

  els.newGame.addEventListener("click", ()=>{
    if (!meta) return;
    localStorage.removeItem(storageKey(meta.dateKey));
    resetState(meta.dateKey);
    setMsg("기록을 초기화했어요. (정답은 그대로)");
    els.input.focus();
  });

  els.shareBtn.addEventListener("click", async ()=>{
    const text = shareText();
    if (!text){ toast("공유할 내용이 없어요."); return; }
    try{
      if (navigator.share){
        await navigator.share({ text });
        toast("공유했어요.");
      }else{
        await navigator.clipboard.writeText(text);
        toast("클립보드에 복사했어요.");
      }
    }catch{
      try{ await navigator.clipboard.writeText(text); toast("클립보드에 복사했어요."); }catch{ setMsg("공유 실패"); }
    }
  });

  els.giveUp.addEventListener("click", ()=>{
    if (!state || state.finished) return;
    state.finished = true;
    state.gaveUp = true;
    state.finishedAt = nowMs();
    saveState();
    render();
    setMsg("포기했어요. 내일 다시 도전해봐요!");
  });
}

init();
