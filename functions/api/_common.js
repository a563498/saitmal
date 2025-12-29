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
    "SELECT id, word, pos, level, definition, example, tokens, rel_tokens FROM entries WHERE word = ? LIMIT 1"
  ).bind(q).first();
  if (!row) return null;
  return {
    id: row.id,
    word: row.word,
    pos: row.pos||"",
    level: row.level||"",
    definition: row.definition||"",
    example: row.example||"",
    tokens: JSON.parse(row.tokens||"[]"),
    rel_tokens: JSON.parse(row.rel_tokens||"[]")
  };
}

export async function pickDailyAnswer(DB, dateKey){
  // deterministic: dateKey -> offset -> SELECT by rowid
  const cntRow = await DB.prepare("SELECT COUNT(*) AS c FROM entries WHERE level IN ('초급','중급','')").first();
  const c = cntRow?.c || 0;
  if (!c) return null;
  const h = hash32("tteutgyeop:"+dateKey);
  const offset = h % c;
  const row = await DB.prepare(
    "SELECT id, word, pos, level, definition, example, tokens, rel_tokens FROM entries WHERE level IN ('초급','중급','') LIMIT 1 OFFSET ?"
  ).bind(offset).first();
  if (!row) return null;
  return {
    id: row.id,
    word: row.word,
    pos: row.pos||"",
    level: row.level||"",
    definition: row.definition||"",
    example: row.example||"",
    tokens: JSON.parse(row.tokens||"[]"),
    rel_tokens: JSON.parse(row.rel_tokens||"[]")
  };
}
