const $ = (s) => document.querySelector(s);

const state = { dateKey:null, gameId:null, tries:[], hintsLevel:0, startTs:null, finished:false };

function nowMs(){ return Date.now(); }
function normalizeWord(w){ return (w||"").trim().replace(/\s+/g,""); }
function storageKey(){ return `tteutgyeop_final_${state.gameId || "daily"}`; }

function save(){
  localStorage.setItem(storageKey(), JSON.stringify({
    dateKey: state.dateKey, tries: state.tries, hintsLevel: state.hintsLevel,
    startTs: state.startTs, finished: state.finished
  }));
}
function load(){
  const raw = localStorage.getItem(storageKey());
  if (!raw) return;
  try{
    const obj = JSON.parse(raw);
    state.dateKey = obj.dateKey ?? state.dateKey;
    state.tries = Array.isArray(obj.tries) ? obj.tries : [];
    state.hintsLevel = typeof obj.hintsLevel === "number" ? obj.hintsLevel : 0;
    state.startTs = typeof obj.startTs === "number" ? obj.startTs : state.startTs;
    state.finished = !!obj.finished;
  }catch{}
}

function setStatus(msg){ $("#statusLine").textContent = msg; }
function escapeHtml(s){ return (s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
function formatElapsed(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const mm = String(Math.floor(s/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${mm}:${ss}`;
}

function updateMetrics(){
  $("#attempts").textContent = String(state.tries.length);
  const best = state.tries.length ? Math.max(...state.tries.map(t=>t.score)) : 0;
  $("#bestScore").textContent = best.toFixed(1);
}
function renderMeta(){ $("#metaLine").textContent = state.gameId ? "랜덤 게임" : `오늘의 단어: ${state.dateKey || ""}`; }
function renderHints(hints){
  const box = $("#hints"); box.innerHTML = "";
  (hints||[]).forEach(p=>{ const el=document.createElement("div"); el.className="pill"; el.textContent=p; box.appendChild(el); });
}
function renderTries(){
  const tbody = $("#triesTable tbody"); tbody.innerHTML = "";
  const sorted = [...state.tries].sort((a,b)=> b.score - a.score);
  for (let i=0;i<sorted.length;i++){
    const t = sorted[i];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td><b>${escapeHtml(t.word)}</b><div class="muted small">${escapeHtml(t.pos||"")}</div></td>
      <td>${t.score.toFixed(1)}</td>
      <td>${(t.common||[]).map(k=>`<span class="kw">${escapeHtml(k)}</span>`).join("")}</td>
      <td><div class="muted small">${t.posMatch ? "품사 일치" : "품사 다름"}</div><div class="muted small">글자수 Δ ${t.lenDiff}</div></td>
    `;
    tbody.appendChild(tr);
  }
  updateMetrics(); renderMeta();
}

function setLastResult(t){
  $("#lastTitle").textContent = t ? `${t.word} (${t.pos||"—"})` : "아직 없음";
  $("#lastPct").textContent = t ? `${t.score.toFixed(1)}%` : "0%";
  $("#barFill").style.width = t ? `${Math.max(0, Math.min(100, t.score))}%` : "0%";
  const common = t ? (t.common||[]).slice(0, 8) : [];
  $("#lastWhy").textContent = !t ? "공통 키워드가 여기에 표시됩니다."
    : (common.length ? `공통 키워드: ${common.join(", ")}` : "공통 키워드가 거의 없어서 높은 점수는 제한됩니다.");
}

async function api(path){
  const url = state.gameId ? `${path}${path.includes("?") ? "&" : "?"}game=${encodeURIComponent(state.gameId)}` : path;
  let res;
  try{ res = await fetch(url, { cache:"no-store" }); }
  catch(e){ return { ok:false, message:"네트워크 오류(인터넷/도메인 확인)", detail:String(e?.message||e) }; }
  const text = await res.text();
  try{ return JSON.parse(text); }
  catch{ return { ok:false, message:`서버 응답이 JSON이 아님 (HTTP ${res.status})`, detail:text.slice(0,150) }; }
}

async function doGuess(){
  if (state.finished){ setStatus("이미 정답을 맞췄어요. 새 게임을 눌러 다시 시작하세요."); return; }
  const w = normalizeWord($("#guessInput").value);
  if (!w) return;
  if (state.tries.some(t=>t.word===w)){ setStatus(`"${w}" 는 이미 시도했어요.`); return; }

  setStatus("사전 조회 중...");
  const out = await api(`/api/guess?word=${encodeURIComponent(w)}`);
  if (!out.ok){ setStatus(out.message || "조회 실패"); return; }

  state.dateKey = out.dateKey ?? state.dateKey;

  const t = { word: out.word, pos: out.pos, score: out.score, common: out.common||[], posMatch: !!out.posMatch, lenDiff: out.lenDiff ?? 0, ts: nowMs() };
  state.tries.push(t);

  if (out.warning){ setStatus(out.warning); }

  if (out.correct){
    state.finished = true;
    const elapsed = formatElapsed(nowMs() - state.startTs);
    setStatus(`정답! 🎉 "${out.answerWord}" · ${state.tries.length}번 · ${elapsed}`);
    const tbody = $("#triesTable tbody");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>—</td><td colspan="4"><div class="muted">정답 뜻풀이: ${escapeHtml(out.answerDef||"")}</div></td>`;
    tbody.prepend(tr);
  } else {
    setStatus(`"${w}" 기록됨. 공통 키워드로 좁혀보세요!`);
  }

  save();
  renderTries();
  setLastResult(t);

  $("#guessInput").value = "";
  $("#guessInput").focus();
}

async function hint(level){
  state.hintsLevel = Math.max(state.hintsLevel, level);
  save();
  const out = await api(`/api/hint?level=${level}`);
  if (!out.ok){ setStatus(out.message || "힌트 실패"); return; }
  renderHints(out.hints || []);
  setStatus(level===1 ? "힌트 1 공개" : "힌트 2 공개");
}

async function reveal(){
  const out = await api(`/api/reveal`);
  if (!out.ok){ setStatus(out.message || "공개 실패"); return; }
  setStatus(`정답 공개: "${out.word}"`);
  renderHints([`정답: ${out.word}`, `품사: ${out.pos||"—"}`]);
  state.finished = true;
  save();
}

async function newGame(){
  state.gameId = `rnd_${crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())}`;
  state.dateKey = null;
  state.tries = [];
  state.hintsLevel = 0;
  state.startTs = nowMs();
  state.finished = false;
  save();
  renderHints([]);
  renderTries();
  setLastResult(null);
  setStatus("새 게임 시작! (랜덤 정답)");
  await api(`/api/meta`);
}

function startTimer(){
  const tick = () => { if (!state.startTs) return; $("#elapsed").textContent = formatElapsed(nowMs() - state.startTs); };
  tick(); setInterval(tick, 1000);
}

async function init(){
  $("#btnGuess").addEventListener("click", doGuess);
  $("#guessInput").addEventListener("keydown", (e)=>{ if (e.key==="Enter") doGuess(); });
  $("#btnHint1").addEventListener("click", ()=>hint(1));
  $("#btnHint2").addEventListener("click", ()=>hint(2));
  $("#btnReveal").addEventListener("click", reveal);
  $("#btnNew").addEventListener("click", newGame);

  const dlg = $("#howDialog");
  $("#btnHow").addEventListener("click", ()=>dlg.showModal());
  $("#btnCloseHow").addEventListener("click", ()=>dlg.close());

  state.gameId = null; // daily
  state.startTs = nowMs();
  load();
  if (!state.startTs) state.startTs = nowMs();

  renderHints([]);
  renderTries();
  setLastResult(state.tries.length ? state.tries[state.tries.length-1] : null);
  startTimer();

  const meta = await api(`/api/meta`);
  if (meta.ok){ state.dateKey = meta.dateKey; save(); renderMeta(); }
  else { setStatus(meta.message || "서버 준비 실패 (키/배포 확인)"); }

  if (!state.finished) setStatus("준비 완료! 단어를 입력해 추론해보세요.");
}
init();
