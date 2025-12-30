export function json(data, status=200){
  return new Response(JSON.stringify(data), { status, headers:{ "content-type":"application/json; charset=utf-8" }});
}

export function seoulDateKey(){
  const d = new Date();
  const kst = new Date(d.getTime() + 9*60*60*1000);
  return kst.toISOString().slice(0,10);
}

function hash32(str){
  let h = 2166136261;
  for (let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h>>>0);
}

export function normalizeWord(w){
  if (!w) return "";
  return String(w).trim().replace(/\s+/g,"");
}

const HANGUL = /[가-힣]+/g;
const STOP = new Set(["그리고","그래서","하지만","그러나","또는","및","등","것","수","하다","되다","있다","없다"]);

export function tokenize(text){
  const s = String(text||"");
  const m = s.match(HANGUL) || [];
  const out=[];
  const seen=new Set();
  for (const w of m){
    if (w.length<=1) continue;
    if (STOP.has(w)) continue;
    if (!seen.has(w)){ seen.add(w); out.push(w); }
  }
  return out;
}

// ---------- D1 schema compatibility ----------
// The project evolved from the original "한국어기초사전" dump schema.
// Some deployments may not have `tokens` / `rel_tokens` columns yet.
// We detect available columns once per isolate and fall back to
// runtime tokenization to keep the API working without a DB migration.

let _entriesCols = null; // Set<string>

async function entriesColumns(DB){
  if (_entriesCols) return _entriesCols;
  try{
    const r = await DB.prepare("PRAGMA table_info(entries)").all();
    const cols = new Set((r?.results||[]).map(x=>String(x.name)));
    _entriesCols = cols;
    return cols;
  }catch{
    // If PRAGMA is blocked for some reason, assume the new schema.
    _entriesCols = new Set(["id","word","pos","level","definition","example","tokens","rel_tokens"]);
    return _entriesCols;
  }
}

function safeJsonArray(s){
  try{
    const v = JSON.parse(s||"[]");
    return Array.isArray(v) ? v : [];
  }catch{ return []; }
}

function jaccard(a, b){
  const A = new Set(a), B = new Set(b);
  let inter=0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter/union : 0;
}

export function similarityScore(guess, answer){
  // guess/answer: {tokens:[], rel_tokens:[]}
  const base = jaccard(guess.tokens, answer.tokens);
  const rel1 = jaccard(guess.tokens, answer.rel_tokens);
  const rel2 = jaccard(guess.rel_tokens, answer.tokens);
  // weighted
  let s = base*0.78 + rel1*0.11 + rel2*0.11;
  // squash: make mid-range more informative
  s = 1 - Math.exp(-3*s);
  return Math.max(0, Math.min(1, s));
}

export async function d1GetByWord(DB, word){
  const q = normalizeWord(word);
  const cols = await entriesColumns(DB);
  const hasTokens = cols.has("tokens") && cols.has("rel_tokens");
  const sql = hasTokens
    ? "SELECT id, word, pos, level, definition, example, tokens, rel_tokens FROM entries WHERE word = ? LIMIT 1"
    : "SELECT id, word, pos, level, definition, example FROM entries WHERE word = ? LIMIT 1";
  const row = await DB.prepare(sql).bind(q).first();
  if (!row) return null;
  const def = row.definition || "";
  const ex = row.example || "";
  return {
    id: row.id,
    word: row.word,
    pos: row.pos||"",
    level: row.level||"",
    definition: def,
    example: ex,
    tokens: ("tokens" in row) ? safeJsonArray(row.tokens) : tokenize(def),
    rel_tokens: ("rel_tokens" in row) ? safeJsonArray(row.rel_tokens) : tokenize(ex)
  };
}

export async function pickDailyAnswer(DB, dateKey){
  // deterministic: dateKey -> offset -> SELECT by rowid
  const cols = await entriesColumns(DB);
  const hasLevel = cols.has("level");
  const cntSql = hasLevel
    ? "SELECT COUNT(*) AS c FROM entries WHERE level IN ('초급','중급','')"
    : "SELECT COUNT(*) AS c FROM entries";
  const cntRow = await DB.prepare(cntSql).first();
  const c = cntRow?.c || 0;
  if (!c) return null;
  const h = hash32("tteutgyeop:"+dateKey);
  const offset = h % c;
  const hasTokens = cols.has("tokens") && cols.has("rel_tokens");
  const where = hasLevel ? "WHERE level IN ('초급','중급','')" : "";
  const selectCols = hasTokens
    ? "id, word, pos, level, definition, example, tokens, rel_tokens"
    : "id, word, pos, level, definition, example";
  const row = await DB.prepare(
    `SELECT ${selectCols} FROM entries ${where} LIMIT 1 OFFSET ?`
  ).bind(offset).first();
  if (!row) return null;
  const def = row.definition || "";
  const ex = row.example || "";
  return {
    id: row.id,
    word: row.word,
    pos: row.pos||"",
    level: row.level||"",
    definition: def,
    example: ex,
    tokens: ("tokens" in row) ? safeJsonArray(row.tokens) : tokenize(def),
    rel_tokens: ("rel_tokens" in row) ? safeJsonArray(row.rel_tokens) : tokenize(ex)
  };
}
