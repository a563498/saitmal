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
let _sensesCols = null;  // Set<string>

async function tableColumns(DB, table){
  try{
    const r = await DB.prepare(`PRAGMA table_info(${table})`).all();
    return new Set((r?.results||[]).map(x=>String(x.name)));
  }catch{
    return new Set();
  }
}

async function entriesColumns(DB){
  if (_entriesCols) return _entriesCols;
  _entriesCols = await tableColumns(DB, "entries");
  return _entriesCols;
}

async function sensesColumns(DB){
  if (_sensesCols) return _sensesCols;
  _sensesCols = await tableColumns(DB, "senses");
  return _sensesCols;
}

function pickCol(cols, candidates, fallback=""){
  for (const c of candidates) if (cols.has(c)) return c;
  return fallback;
}

async function loadSenseByEntryId(DB, entryId){
  const sCols = await sensesColumns(DB);
  if (!sCols || sCols.size === 0) return { definition:"", example:"" };

  const fk = pickCol(sCols, ["entry_id","entryId","eid","entry"], "entry_id");
  const defCol = pickCol(sCols, ["definition","def","mean","meaning"], "definition");
  const exCol = pickCol(sCols, ["example","exam","ex"], "example");
  const ord = pickCol(sCols, ["sense_no","senseNo","ord","order_no","id"], "id");

  const sql = `SELECT ${defCol} AS definition, ${exCol} AS example FROM senses WHERE ${fk} = ? ORDER BY ${ord} ASC LIMIT 1`;
  const row = await DB.prepare(sql).bind(entryId).first();
  return { definition: row?.definition || "", example: row?.example || "" };
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
  const idCol = pickCol(cols, ["id","entry_id","entryId"], "id");
  const wordCol = pickCol(cols, ["word","lemma","headword"], "word");
  const posCol = pickCol(cols, ["pos","part_of_speech","pos_name"], "pos");
  const levelCol = pickCol(cols, ["level","difficulty"], "level");

  const hasDefinition = cols.has("definition");
  const hasExample = cols.has("example");
  const hasTokens = cols.has("tokens") && cols.has("rel_tokens");

  // v2 schema: entries(definition/example/tokens...)
  // v1 schema: entries + senses(definition/example)
  const select = [
    `${idCol} AS id`,
    `${wordCol} AS word`,
    `${posCol} AS pos`,
    `${levelCol} AS level`,
    hasDefinition ? "definition AS definition" : "'' AS definition",
    hasExample ? "example AS example" : "'' AS example",
    hasTokens ? "tokens AS tokens" : "NULL AS tokens",
    hasTokens ? "rel_tokens AS rel_tokens" : "NULL AS rel_tokens",
  ].join(", ");

  const row = await DB.prepare(`SELECT ${select} FROM entries WHERE ${wordCol} = ? LIMIT 1`).bind(q).first();
  if (!row) return null;

  let def = row.definition || "";
  let ex = row.example || "";
  if (!hasDefinition){
    const s = await loadSenseByEntryId(DB, row.id);
    def = s.definition;
    ex = s.example;
  }
  return {
    id: row.id,
    word: row.word,
    pos: row.pos||"",
    level: row.level||"",
    definition: def,
    example: ex,
    tokens: row.tokens ? safeJsonArray(row.tokens) : tokenize(def),
    rel_tokens: row.rel_tokens ? safeJsonArray(row.rel_tokens) : tokenize(ex)
  };
}

export async function pickDailyAnswer(DB, dateKey){
  // deterministic: dateKey -> offset -> SELECT by rowid
  const cols = await entriesColumns(DB);
  const hasLevel = cols.has("level");
  const levelCol = pickCol(cols, ["level","difficulty"], "level");
  const cntSql = (hasLevel && levelCol)
    ? `SELECT COUNT(*) AS c FROM entries WHERE ${levelCol} IN ('초급','중급','')`
    : "SELECT COUNT(*) AS c FROM entries";
  const cntRow = await DB.prepare(cntSql).first();
  const c = cntRow?.c || 0;
  if (!c) return null;
  const h = hash32("tteutgyeop:"+dateKey);
  const offset = h % c;
  const idCol = pickCol(cols, ["id","entry_id","entryId"], "id");
  const wordCol = pickCol(cols, ["word","lemma","headword"], "word");
  const posCol = pickCol(cols, ["pos","part_of_speech","pos_name"], "pos");

  const hasDefinition = cols.has("definition");
  const hasExample = cols.has("example");
  const hasTokens = cols.has("tokens") && cols.has("rel_tokens");

  const where = (hasLevel && levelCol) ? `WHERE ${levelCol} IN ('초급','중급','')` : "";
  const select = [
    `${idCol} AS id`,
    `${wordCol} AS word`,
    `${posCol} AS pos`,
    `${levelCol} AS level`,
    hasDefinition ? "definition AS definition" : "'' AS definition",
    hasExample ? "example AS example" : "'' AS example",
    hasTokens ? "tokens AS tokens" : "NULL AS tokens",
    hasTokens ? "rel_tokens AS rel_tokens" : "NULL AS rel_tokens",
  ].join(", ");

  const row = await DB.prepare(`SELECT ${select} FROM entries ${where} LIMIT 1 OFFSET ?`).bind(offset).first();
  if (!row) return null;

  let def = row.definition || "";
  let ex = row.example || "";
  if (!hasDefinition){
    const s = await loadSenseByEntryId(DB, row.id);
    def = s.definition;
    ex = s.example;
  }
  return {
    id: row.id,
    word: row.word,
    pos: row.pos||"",
    level: row.level||"",
    definition: def,
    example: ex,
    tokens: row.tokens ? safeJsonArray(row.tokens) : tokenize(def),
    rel_tokens: row.rel_tokens ? safeJsonArray(row.rel_tokens) : tokenize(ex)
  };
}
