
function getPercent(d){
  if (typeof d.percent === "number") return d.percent;
  if (typeof getPercent(d) === "number") return Math.round(getPercent(d)*100);
  if (typeof getPercent(d) === "string" && getPercent(d).endsWith("%")) return parseInt(getPercent(d),10)||0;
  return 0;
}

const $ = (id)=>document.getElementById(id);

const els = {
  triesCount: $("triesCount"),
  elapsed: $("elapsed"),
  bestPct: $("bestPct"),
  dateKey: $("dateKey"),
  msg: $("msg"),
  form: $("guessForm"),
  input: $("guessInput"),
  list: $("guessList"),
  newGame: $("newGameBtn"),
  giveUp: $("giveUpBtn"),
  themeBtn: $("themeBtn"),
};

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
  const j = await r.json();
  if (!j.ok) throw new Error(j.message || "meta failed");
  return j;
}

async function guessWord(word){
  const u = new URL("/api/guess", location.origin);
  u.searchParams.set("word", word);
  const r = await fetch(u.toString(), { cache:"no-store" });
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
      if (!res.ok){ setMsg(res.message || "실패"); return; }
      const d = res.data;
      if (!d){ setMsg("응답 형식 오류"); return; }

      const word = (d.word || w).trim();
      const pct = Number(getPercent(d));
      if (!Number.isFinite(pct)){ setMsg("유사도 계산 실패"); return; }

      if (state.guesses.some(x=>normWord(x.word) === normWord(word))){
        setMsg("이미 입력한 단어예요.");
        return;
      }

      state.guesses.push({ word, pct, clues: d.clues, createdAt: nowMs() });

      if (d.isCorrect){
        state.finished = true;
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

  els.giveUp.addEventListener("click", ()=>{
    if (!state || state.finished) return;
    state.finished = true;
    state.gaveUp = true;
    saveState();
    render();
    setMsg("포기했어요. 내일 다시 도전해봐요!");
  });
}

init();


function openHowto(){
  const m = $("howtoModal");
  if (!m) return;
  m.setAttribute("aria-hidden","false");
}
function closeHowto(){
  const m = $("howtoModal");
  if (!m) return;
  m.setAttribute("aria-hidden","true");
}
$("howtoBtn")?.addEventListener("click", openHowto);
$("howtoClose")?.addEventListener("click", closeHowto);
$("howtoModal")?.addEventListener("click", (e)=>{
  const t = e.target;
  if (t && t.dataset && t.dataset.close) closeHowto();
});
document.addEventListener("keydown", (e)=>{
  if (e.key==="Escape") closeHowto();
});

