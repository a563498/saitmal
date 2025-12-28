const $ = (s) => document.querySelector(s);

const state = { dateKey:null, tries:[], hintsLevel:0, gameId:null };

function normalizeWord(w){ return (w||"").trim().replace(/\s+/g,""); }

function save(){
  const key = `tteutgyeop_dyn_save_${state.gameId || "daily"}`;
  localStorage.setItem(key, JSON.stringify({ tries: state.tries, hintsLevel: state.hintsLevel }));
}
function load(){
  const key = `tteutgyeop_dyn_save_${state.gameId || "daily"}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try{
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.tries)) state.tries = obj.tries;
    if (typeof obj.hintsLevel === "number") state.hintsLevel = obj.hintsLevel;
  }catch{}
}

function setStatus(msg){ $("#statusLine").textContent = msg; }
function escapeHtml(s){ return (s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }

function renderMeta(){
  const tries = state.tries.length;
  const best = tries ? Math.max(...state.tries.map(t=>t.score)) : 0;
  $("#metaLine").textContent = `${state.dateKey ? `오늘의 단어: ${state.dateKey}` : "랜덤 게임"} · 시도 ${tries}회 · 최고점 ${best.toFixed(1)}`;
}

function renderHints(hints){
  const box = $("#hints"); box.innerHTML = "";
  (hints||[]).forEach(p=>{
    const el = document.createElement("div");
    el.className = "pill"; el.textContent = p;
    box.appendChild(el);
  });
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
      <td>
        <div class="muted small">${t.posMatch ? "품사 일치" : "품사 다름"}</div>
        <div class="muted small">글자수 Δ ${t.lenDiff}</div>
      </td>
    `;
    tbody.appendChild(tr);
  }
  renderMeta();
}

async function api(path){
  const url = state.gameId ? `${path}${path.includes("?") ? "&" : "?"}game=${encodeURIComponent(state.gameId)}` : path;
  const res = await fetch(url, { cache:"no-store" });
  return res.json();
}

async function doGuess(){
  const w = normalizeWord($("#guessInput").value);
  if (!w) return;
  if (state.tries.some(t=>t.word===w)){ setStatus(`"${w}" 는 이미 시도했어요.`); return; }

  setStatus("사전 조회 중...");
  const out = await api(`/api/guess?word=${encodeURIComponent(w)}`);

  if (!out.ok){ setStatus(out.message || "조회 실패"); return; }

  state.dateKey = out.dateKey || state.dateKey;

  state.tries.push({
    word: out.word, pos: out.pos, score: out.score,
    common: out.common||[], posMatch: !!out.posMatch,
    lenDiff: out.lenDiff ?? 0, ts: Date.now()
  });
  save();
  renderTries();

  if (out.correct){
    setStatus(`정답! 🎉 "${out.answerWord}" 를 ${state.tries.length}번 만에 맞췄어요.`);
    const tbody = $("#triesTable tbody");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>—</td><td colspan="4"><div class="muted">정답 뜻풀이: ${escapeHtml(out.answerDef||"")}</div></td>`;
    tbody.prepend(tr);
  }else{
    setStatus(`"${w}" 기록됨. 공통키워드를 모아 좁혀보세요!`);
  }

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
  const tbody = $("#triesTable tbody");
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>—</td><td colspan="4"><div class="muted">정답 공개: ${escapeHtml(out.word)} · ${escapeHtml(out.pos||"")} · ${escapeHtml(out.def||"")}</div></td>`;
  tbody.prepend(tr);
}

async function newGame(){
  state.gameId = `rnd_${crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())}`;
  state.tries = []; state.hintsLevel = 0;
  save(); renderHints([]); renderTries();
  setStatus("새 게임 시작! (랜덤 정답)");
  await api(`/api/meta`);
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

  load(); renderHints([]); renderTries();

  const meta = await api(`/api/meta`);
  if (meta.ok){ state.dateKey = meta.dateKey; renderMeta(); }

  setStatus("준비 완료! 단어를 입력해 추론해보세요.");
}
init();
