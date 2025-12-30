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
  const row = await DB.prepare(
    `SELECT e.id as id, e.word as word, e.pos as pos, e.level as level,
            s.definition as definition, s.examples as example
     FROM entries e
     LEFT JOIN senses s ON s.entry_id = e.id
     WHERE e.word = ?
     ORDER BY s.id ASC
     LIMIT 1`
  ).bind(q).first();

  if (!row) return null;

  const def = (row.definition || "").trim();
  const ex = (row.example || "").trim();

  const tokens = tokenize(def);
  const rel_tokens = tokenize(def + " " + ex);

  return {
    id: row.id,
    word: row.word,
    pos: row.pos||"",
    level: row.level||"",
    definition: def,
    example: ex,
    tokens,
    rel_tokens
  };
}

export async function pickDailyAnswer(DB, dayKey){
  const seed = hash32(dayKey);
  const totalRow = await DB.prepare(
    "SELECT COUNT(*) as c FROM entries WHERE is_candidate = 1"
  ).first();
  const total = (totalRow && totalRow.c) ? Number(totalRow.c) : 0;
  if (!total) return null;

  const offset = seed % total;

  const row = await DB.prepare(
    `SELECT e.id as id, e.word as word, e.pos as pos, e.level as level,
            s.definition as definition, s.examples as example
     FROM entries e
     LEFT JOIN senses s ON s.entry_id = e.id
     WHERE e.is_candidate = 1
     ORDER BY e.id ASC, s.id ASC
     LIMIT 1 OFFSET ?`
  ).bind(offset).first();

  if (!row) return null;

  const def = (row.definition || "").trim();
  const ex = (row.example || "").trim();

  const tokens = tokenize(def);
  const rel_tokens = tokenize(def + " " + ex);

  return {
    id: row.id,
    word: row.word,
    pos: row.pos||"",
    level: row.level||"",
    definition: def,
    example: ex,
    tokens,
    rel_tokens
  };
}
