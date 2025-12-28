const API_SEARCH = "https://opendict.korean.go.kr/api/search";
const API_VIEW = "https://opendict.korean.go.kr/api/view";

const STOP = new Set([
  "그리고","또는","또","등","것","수","일","때","위해","같은","으로","로","에서","에게","을","를","은","는","이","가","과","와",
  "하다","되다","있다","없다","만들다","사용","사람","하는","부분","여러","정해","정한","대상","정도","보통",
  "어떤","같이","바탕","통해","비유","가능","필요","경우","기본","값","따라"
]);

function normalizeWord(w){ return (w || "").trim().replace(/\s+/g, ""); }

function tokenize(text){
  const raw = (text || "")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out = [];
  for (const t of raw){
    if (t.length <= 1) continue;
    if (STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

function weightedJaccard(a, b){
  let inter = 0, uni = 0;
  const all = new Set([...a, ...b]);
  for (const tok of all){
    const w = Math.min(3, Math.max(1, Math.floor(tok.length / 2)));
    const inA = a.has(tok);
    const inB = b.has(tok);
    if (inA || inB) uni += w;
    if (inA && inB) inter += w;
  }
  return uni === 0 ? 0 : inter / uni;
}

function commonKeywords(a, b, limit=10){
  const common = [];
  for (const tok of a) if (b.has(tok)) common.push(tok);
  common.sort((x,y)=> y.length - x.length);
  return common.slice(0, limit);
}

function choseong(word){
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  let out = "";
  for (const ch of word){
    const code = ch.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3){ out += ch; continue; }
    const idx = Math.floor((code - 0xAC00) / (21*28));
    out += CHO[idx] || ch;
  }
  return out;
}

function seoulDateKey(){
  const now = new Date();
  const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = seoul.getFullYear();
  const m = String(seoul.getMonth()+1).padStart(2,"0");
  const d = String(seoul.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function fnv1a32(str){
  const enc = new TextEncoder().encode(str);
  let h = 2166136261;
  for (const b of enc){ h ^= b; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

async function fetchJson(url, cf={}){
  const res = await fetch(url, { cf });
  if (!res.ok) throw new Error(`Upstream error: ${res.status}`);
  return res.json();
}

function stripCaret(w){ return (w || "").replace(/\^/g, ""); }

async function opendictSearch(env, q, opts={}){
  const key = env.OPENDICT_KEY;
  if (!key) throw new Error("Missing OPENDICT_KEY");
  const p = new URLSearchParams({
    key,
    q,
    req_type: "json",
    advanced: "n",
    part: "word",
    method: opts.method || "exact",
    start: String(opts.start || 1),
    num: String(opts.num || 30),
    sort: opts.sort || "dict",
  });
  return fetchJson(`${API_SEARCH}?${p.toString()}`, { cacheTtl: 3600, cacheEverything: true });
}

async function opendictViewByTarget(env, targetCode){
  const key = env.OPENDICT_KEY;
  const p = new URLSearchParams({
    key,
    method: "target_code",
    q: String(targetCode),
    req_type: "json",
  });
  return fetchJson(`${API_VIEW}?${p.toString()}`, { cacheTtl: 3600, cacheEverything: true });
}

function pickEntryFromSearch(searchJson, wordExact=null){
  const items = searchJson?.channel?.item;
  if (!items) return null;
  const arr = Array.isArray(items) ? items : [items];
  if (wordExact){
    const norm = stripCaret(wordExact);
    const found = arr.find(it => stripCaret(it.word) === norm);
    if (found) return found;
  }
  return arr[0] || null;
}

async function lookupWord(env, word){
  const w = normalizeWord(word);
  const s = await opendictSearch(env, w, { method:"exact", num:50, sort:"dict" });
  const item = pickEntryFromSearch(s, w);
  if (!item) return null;

  const out = {
    word: stripCaret(item.word),
    pos: item.pos || "",
    definition: item.definition || "",
    sense_no: item.sense_no ?? "",
    target_code: item.target_code ?? null,
    type: item.type || "",
    cat: item.cat || item.cat_info?.cat || "",
    link: item.link || "",
  };

  if ((!out.definition || !out.pos) && out.target_code){
    const v = await opendictViewByTarget(env, out.target_code);
    const item2 = v?.channel?.item;
    const sense = item2?.senseinfo || item2?.senseInfo;
    if (!out.definition && sense?.definition) out.definition = sense.definition;
    if (!out.pos && sense?.pos) out.pos = sense.pos;
    out.link = v?.channel?.link || out.link;
  }
  return out;
}

async function pickDailyAnswer(env, gameId=null){
  const seed = gameId ? `game:${gameId}` : `date:${seoulDateKey()}`;
  const h = fnv1a32(seed);

  const syllables = ["가","나","다","라","마","바","사","아","자","차","카","타","파","하"];
  const q = syllables[h % syllables.length];

  const start = 1 + ((h >>> 8) % 800);
  const s = await opendictSearch(env, q, { method:"include", start, num:30, sort:"dict" });

  const items = s?.channel?.item;
  const arr = Array.isArray(items) ? items : (items ? [items] : []);
  if (!arr.length) throw new Error("No answer candidates");

  const picked = arr[(h >>> 16) % arr.length];
  const ans = {
    word: stripCaret(picked.word),
    pos: picked.pos || "",
    definition: picked.definition || "",
    target_code: picked.target_code ?? null,
    type: picked.type || "",
    cat: picked.cat || picked.cat_info?.cat || ""
  };

  if ((!ans.definition || !ans.pos) && ans.target_code){
    const v = await opendictViewByTarget(env, ans.target_code);
    const item2 = v?.channel?.item;
    const sense = item2?.senseinfo || item2?.senseInfo;
    if (!ans.definition && sense?.definition) ans.definition = sense.definition;
    if (!ans.pos && sense?.pos) ans.pos = sense.pos;
  }
  return ans;
}

function jsonResponse(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }
  });
}

export {
  normalizeWord, tokenize, weightedJaccard, commonKeywords, choseong, seoulDateKey,
  lookupWord, pickDailyAnswer, jsonResponse
};
