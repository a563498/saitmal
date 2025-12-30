/* FX */
function rand(min,max){ return Math.random()*(max-min)+min; }

function makeSnowState(){
  const w = fxCanvas.width, h = fxCanvas.height;
  const count = Math.min(160, Math.floor((w*h)/22000)+40);
  const flakes = Array.from({length:count},()=>({
    x: rand(0,w), y: rand(0,h),
    r: rand(1.2,3.2),
    v: rand(0.6,1.8),
    d: rand(-0.6,0.6),
    o: rand(0.5,0.95)
  }));
  return { flakes };
}
let snowState = null;
function drawSnow(){
  if (!fxCtx) return;
  const w = fxCanvas.width, h = fxCanvas.height;
  if (!snowState) snowState = makeSnowState();
  fxCtx.clearRect(0,0,w,h);
  fxCtx.fillStyle = "#ffffff";
  for (const f of snowState.flakes){
    f.y += f.v;
    f.x += f.d;
    if (f.y > h+10){ f.y = -10; f.x = rand(0,w); }
    if (f.x < -10) f.x = w+10;
    if (f.x > w+10) f.x = -10;
    fxCtx.globalAlpha = f.o;
    fxCtx.beginPath();
    fxCtx.arc(f.x,f.y,f.r,0,Math.PI*2);
    fxCtx.fill();
  }
  fxCtx.globalAlpha = 1;
}

function makeSparkleState(){
  const w = fxCanvas.width, h = fxCanvas.height;
  const count = Math.min(90, Math.floor((w*h)/32000)+28);
  const p = Array.from({length:count},()=>({
    x: rand(0,w), y: rand(0,h),
    r: rand(0.8,2.4),
    v: rand(0.2,0.6),
    o: rand(0.15,0.55)
  }));
  return { p };
}
let sparkleState=null;
function drawSparkles(){
  if (!fxCtx) return;
  const w = fxCanvas.width, h = fxCanvas.height;
  fxCtx.fillStyle = "#ffffff";
  if (!sparkleState) sparkleState = makeSparkleState();
  fxCtx.clearRect(0,0,w,h);
  for (const s of sparkleState.p){
    s.y -= s.v;
    if (s.y < -10){ s.y = h+10; s.x = rand(0,w); }
    fxCtx.globalAlpha = s.o;
    fxCtx.beginPath();
    fxCtx.arc(s.x,s.y,s.r,0,Math.PI*2);
    fxCtx.fill();
  }
  fxCtx.globalAlpha = 1;
}

// 사잇말 - frontend (clean)
// No build step, pure vanilla JS

const $ = (id)=>document.getElementById(id);

const LS_KEY = "saitmal_state_v2";
const THEME_KEY = "saitmal_theme";
const ANIM_KEY = "saitmal_anim";

let state = {
  dateKey: null,
  startAt: null,
  tries: 0,
  best: 0,
  guesses: [] // {word, percent, clues, ts}
};

// ---------- utils ----------
function fmtTime(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const mm = String(Math.floor(s/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${mm}:${ss}`;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}
function setStatus(msg){ const el=$("msg"); if(el) el.textContent = msg||""; }

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === "object") state = s;
  }catch{}
}
function saveState(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch{}
}

// ---------- theme ----------
function getTheme(){
  const t = localStorage.getItem(THEME_KEY);
  return (t==="dark") ? "dark" : "light";
}


const seasonalType = () => {
  try{
    const now = new Date();
    const m = now.getMonth() + 1; // 1-12
    const d = now.getDate();
    // Winter snow: Dec/Jan/Feb
    if (m === 12 || m === 1 || m === 2) {
      // Christmas sparkle window (optional)
      if (m === 12 && d >= 15) return "xmas";
      return "snow";
    }
    return "off";
  }catch(e){
    return "off";
  }
};


function applyTheme(t){
  const theme = (t==="dark") ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  const b = $("themeBtn");
  if (b) b.textContent = (theme==="dark") ? "🌙" : "☀️";
}
function toggleTheme(){
  const next = (getTheme()==="dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// ---------- animations (FX) ----------
let fxCanvas=null, fxCtx=null, fxW=0, fxH=0;
let seasonalRAF=0;
let seasonalRunning = false;
let particles=[];

function animEnabled(){
  const v = localStorage.getItem(ANIM_KEY);
  return v === null ? true : (v === "1");
}
function setAnimEnabled(on){
  localStorage.setItem(ANIM_KEY, on ? "1":"0");
  const icon = $("animBtn");
  if (icon) icon.textContent = on ? "🎆" : "🚫";
  if (!on) stopSeasonalFx();
  else startSeasonalFx();
}
function toggleAnim(){
  setAnimEnabled(!animEnabled());
}

function ensureFx(){
  if (fxCanvas) return;
  fxCanvas = document.createElement("canvas");
  fxCanvas.id = "fxCanvas";
  fxCanvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60";
  document.body.appendChild(fxCanvas);
  fxCtx = fxCanvas.getContext("2d");
  const resize = ()=>{
    fxW = fxCanvas.width = window.innerWidth;
    fxH = fxCanvas.height = window.innerHeight;
  };
  window.addEventListener("resize", resize);
  resize();
}

function confettiBurst(){
  if (!animEnabled()) return;
  ensureFx();
  particles = [];
  const N = 150;
  const cx = fxW/2;
  const cy = Math.min(260, fxH*0.35);
  for (let i=0;i<N;i++){
    particles.push({
      x: cx, y: cy,
      vx: (Math.random()*2-1)*7,
      vy: -Math.random()*10-4,
      g: 0.28 + Math.random()*0.12,
      s: 3 + Math.random()*4,
      r: Math.random()*Math.PI,
      vr: (Math.random()*2-1)*0.2,
      life: 240 + Math.random()*100,
      a: 1
    });
  }
  let raf=0;
  const tick=()=>{
    fxCtx.clearRect(0,0,fxW,fxH);
    for (const p of particles){
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      p.life -= 1;
      p.a = Math.max(0, Math.min(1, p.life/140));
      fxCtx.save();
      fxCtx.globalAlpha = p.a;
      fxCtx.translate(p.x,p.y);
      fxCtx.rotate(p.r);
      fxCtx.fillStyle = `hsl(${(p.x+p.y+p.life)%360} 85% 60%)`;
      fxCtx.fillRect(-p.s/2,-p.s/2,p.s,p.s*1.4);
      fxCtx.restore();
    }
    const alive = particles.some(p=>p.life>0 && p.y<fxH+60);
    if (alive) raf = requestAnimationFrame(tick);
    else fxCtx.clearRect(0,0,fxW,fxH);
  };
  if (seasonalRAF) {} // keep seasonal separate
  cancelAnimationFrame(raf);
  tick();
}

function stopSeasonalFx(){
  seasonalRunning = false;
  if (seasonalTimer) { cancelAnimationFrame(seasonalTimer); seasonalTimer = 0; }
  if (fxRAF) { cancelAnimationFrame(fxRAF); fxRAF = 0; }
  try{ fxCtx && fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);}catch(e){}
  try{ snowState = null; sparkleState = null; }catch(e){}
}

function startSeasonalFx(){
  ensureFx();
  if (!fxCanvas || !fxCtx) return;
  if (seasonalRunning) return;
  seasonalRunning = true;

  const m = (new Date()).getMonth()+1; // 1-12
  const mode = (m===12 || m===1 || m===2) ? "snow" : "sparkle";

  fxCtx.fillStyle = "rgba(255,255,255,0.95)";

  function loop(){
    if (!seasonalRunning) return;
    if (mode === "snow") drawSnow();
    else drawSparkles();
    seasonalTimer = requestAnimationFrame(loop);
  }
  loop();
}

// ---------- API ----------
async function apiJson(url, opts){
  const r = await fetch(url, opts);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")){
    const t = await r.text();
    throw new Error(`API가 JSON이 아니에요: ${t.slice(0,120)}`);
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
  return j;
}

function render(){
  $("triesCount").textContent = state.tries || 0;
  $("bestPct").textContent = `${state.best||0}%`;
  // 정답(100%) 제외: DB 기준 최고 유사도(Top1)
  const near = typeof state.bestDB === "number" ? state.bestDB : 0;
  const bestNearEl = $("bestNear");
  if (bestNearEl) bestNearEl.textContent = `${near||0}%`;
  $("dateKey").textContent = state.dateKey || "-";
  if (state.gameOver) $("topBtn")?.classList.remove("hidden"); else $("topBtn")?.classList.add("hidden");

  const list = $("guessList");
  if (!list) return;
  list.innerHTML = "";

  // 정렬 규칙:
  // 1) 가장 최근 입력(마지막 입력) 1개를 맨 위에 고정
  // 2) 그 외는 유사도 높은 순(같으면 최근 입력이 위)
  const last = state.lastWord;
  const pinned = [];
  const rest = [];
  for (const g of (state.guesses||[])){
    if (last && g.word === last) pinned.push(g);
    else rest.push(g);
  }
  rest.sort((a,b)=> (b.percent-a.percent) || (b.ts-a.ts));
  const items = [...pinned.sort((a,b)=>b.ts-a.ts), ...rest];
  for (const g of items){
    const el = document.createElement("div");
    el.className = "item";
    const top = document.createElement("div");
    top.className = "itemTop";

    const left = document.createElement("div");
    left.innerHTML = `<div class="word">${escapeHtml(g.word)}</div>`;

    const right = document.createElement("div");
    right.className = "sim";
    right.innerHTML = `<div class="simPct">${g.percent}%</div>
      <div class="bar"><div class="barFill" style="width:${g.percent}%"></div></div>`;

    top.appendChild(left); top.appendChild(right);
    el.appendChild(top);

    const clues = document.createElement("div");
    clues.className = "clues";
    // clues removed
    el.appendChild(clues);

    list.appendChild(el);
  }
}
function tag(text){
  const s = document.createElement("span");
  s.className = "tag";
  s.textContent = text;
  return s;
}
function fmtDelta(n){ if (n===0) return "0"; return n>0?`+${n}`:`${n}`; }

async function openTop(){
  const modal = $("topModal");
  const body = $("topBody");
  if (!modal || !body) return;
  body.textContent = "불러오는 중...";
  modal.setAttribute("aria-hidden","false");
  try{
    const r = await apiJson("/api/top?limit=10");
    const items = r.items || [];
    const ans = r.answer || {};
    const title = $("topTitle");
    if (title) title.textContent = `TOP 10 · 정답: ${ans.word||""}`;
    const wrap = document.createElement("div");
    wrap.className = "topList";
    if (!items.length){
      wrap.textContent = "표시할 데이터가 없어요.";
    } else {
      for (let i=0;i<items.length;i++){
        const it = items[i];
        const row = document.createElement("div");
        row.className = "topRow";
        row.innerHTML = `<span class="rk">${i+1}</span><span class="w">${escapeHtml(it.word||"")}</span><span class="p">${it.percent??0}%</span>`;
        wrap.appendChild(row);
      }
    }
    body.innerHTML = "";
    body.appendChild(wrap);
  }catch(e){
    body.textContent = e.message || String(e);
  }
}
function closeTop(){
  $("topModal")?.setAttribute("aria-hidden","true");
}

async function init(){
  loadState();

  // Theme + anim defaults
  applyTheme(getTheme());
  setAnimEnabled(animEnabled());

  // Bind buttons
  $("themeBtn")?.addEventListener("click", toggleTheme);
  $("animBtn")?.addEventListener("click", toggleAnim);

  // Timer
  setInterval(()=>{ if(state.startAt) $("elapsed").textContent = fmtTime(Date.now()-state.startAt); }, 250);

  // Howto modal binding (requires elements)
  bindHowtoModal();

  // Meta
  try{
    const m = await apiJson("/api/meta");
    if (state.dateKey !== m.dateKey){
      state = { dateKey: m.dateKey, startAt: Date.now(), tries:0, best:0, guesses:[], gameOver:false };
      saveState();
    } else {
      if (!state.startAt) state.startAt = Date.now();
    }
    state.bestDB = typeof m.bestDB === 'number' ? m.bestDB : (state.bestDB||0);
    saveState();
    render();
  }catch(e){
    setStatus("초기화 실패: " + e.message);
  }

  // Submit handlers
  // 폼 submit(Enter/버튼 클릭) 시 페이지 리로드를 막고, submit()만 실행
  const form = document.getElementById("guessForm");
  form?.addEventListener("submit", (e) => { e.preventDefault(); submit(); });

  // 혹시 폼 밖에서 버튼이 눌리는 경우도 대비
  $("submitBtn")?.addEventListener("click", (e) => { e.preventDefault(); submit(); });
  $("guessInput")?.addEventListener("keydown", (e)=>{ if (e.key==="Enter") { e.preventDefault(); submit(); } });
  $("giveupBtn")?.addEventListener("click", giveUp);
  $("topBtn")?.addEventListener("click", openTop);
  $("topClose")?.addEventListener("click", closeTop);
  $("topModal")?.addEventListener("click", (e)=>{ if (e.target?.dataset?.close) closeTop(); });

  // Start seasonal fx
  startSeasonalFx();
}

function bindHowtoModal(){
  const btn = $("howtoBtn");
  const modal = $("howtoModal");
  const close = $("howtoClose");
  if (!btn || !modal) return;
  const open = ()=> modal.setAttribute("aria-hidden","false");
  const shut = ()=> modal.setAttribute("aria-hidden","true");
  btn.addEventListener("click", open);
  close?.addEventListener("click", shut);
  modal.addEventListener("click", (e)=>{ if (e.target?.dataset?.close) shut(); });
  document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") shut(); });
}

async function submit(){
  if (state.gameOver){ setStatus('오늘 게임은 종료되었어요. 내일 다시 도전해 주세요!'); return; }
  const inp = $("guessInput");
  if (!inp) return;
  const word = inp.value.trim();
  if (!word) return;
  inp.value = "";
  setStatus("");

  try{
    const res = await apiJson(`/api/guess?word=${encodeURIComponent(word)}`);
    const d = res.data;
    const percent = typeof d.percent === "number" ? d.percent : 0;
    state.lastWord = d.word;
    state.tries = (state.tries||0) + 1;
    state.best = Math.max(state.best||0, percent);
    state.guesses = state.guesses || [];
const now = Date.now();
state.lastWord = d.word;
const existing = state.guesses.find(x => x.word === d.word);
if (existing){
  // 중복 단어는 리스트에 1번만: 더 높은 %는 보존, 최근 추론은 맨 위로 올라오게 ts 갱신
  existing.percent = Math.max(existing.percent||0, percent);
  existing.clues = d.clues;
  existing.ts = now;
} else {
  state.guesses.push({ word: d.word, percent, clues: d.clues, ts: now });
}
saveState();
render();


    if (d.isCorrect){
      state.gameOver = true;
      saveState();
      $("topBtn")?.classList.remove("hidden");
      confettiBurst();
      setStatus(`정답! ${state.tries}번째 · ${fmtTime(Date.now()-(state.startAt||Date.now()))}`);
    }
  }catch(e){
    setStatus(e.message);
  }
}

async function giveUp(){
  try{
    const r = await apiJson("/api/giveup", { method:"POST" });
    const a = r.answer || {};
    setStatus(`포기! 정답: ${a.word||""} - ${a.definition||""}`);
    state.gameOver = true;
    saveState();
    $("topBtn")?.classList.remove("hidden");
  }catch(e){
    setStatus(e.message);
  }
}

// Mobile keyboard/layout helper (keeps guess list visible above on-screen keyboard)
function updateViewportLayout(){
  try{
    const vv = window.visualViewport;
    const vvh = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--vvh", vvh + "px");
    const header = document.querySelector("header");
    const play = document.getElementById("playCard");
    const list = document.getElementById("guessList");
    if (!list) return;
    const hH = header ? header.getBoundingClientRect().height : 0;
    const pH = play ? play.getBoundingClientRect().height : 0;
    const pad = 34; // spacing
    const avail = Math.max(160, vvh - hH - pH - pad);
    document.documentElement.style.setProperty("--listH", avail + "px");
  }catch(e){}
}

document.addEventListener("DOMContentLoaded", ()=>{ init(); updateViewportLayout(); });
window.addEventListener("resize", updateViewportLayout, {passive:true});
(window.visualViewport&&window.visualViewport.addEventListener("resize", updateViewportLayout, {passive:true}));
(window.visualViewport&&window.visualViewport.addEventListener("scroll", updateViewportLayout, {passive:true}));
