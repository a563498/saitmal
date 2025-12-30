// Shared helpers for Pages Functions (Workers)

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function seoulDateKey() {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------- normalization / tokenize ----------------
const HANGUL_SEQ = /[가-힣]+/g;

// 너무 흔한 기능어/보조용언(정의/예문 토큰화에서 제거)
const STOP = new Set(
  "그리고 그래서 하지만 그러나 또는 및 등 것을 있다 없다 하다 되다 하게 하기 했다 했다 대한 대한것 이다 이며 이고".split(
    " "
  )
);

// 한 글자라도 의미가 큰 토큰(연/월/일/년/해 등)
const SINGLE_KEEP = new Set(["년", "해", "월", "일", "봄", "여름", "가을", "겨울"]);

// 사람 기준 '유사하다'고 느끼는 대표 동의(정규화)
const SYN = new Map([
  // 시간
  ["금년", "올해"],
  ["금일", "오늘"],
  ["당년", "올해"],
  ["명년", "내년"],
  ["익년", "내년"],
  ["내년도", "내년"],
  ["지난해", "작년"],
  ["전년", "작년"],
  ["작년도", "작년"],
  ["명일", "내일"],
  ["작일", "어제"],
  // 기타 자주 나오는 표기
  ["대한민국", "한국"],
  // 연도/시점
  ["내년", "다음해"],
  ["명년", "다음해"],
  ["내후년", "다다음해"],
  ["금년도", "올해"],
  // 의미군(가벼운 정규화)
  ["디자인", "설계"],
  ["디자이너", "설계자"],
  ["포토샵", "그래픽"],
  ["일러스트", "그림"],
]);

function normToken(t) {
  t = (t || "").trim();
  if (!t) return "";
  // 동의어 정규화
  if (SYN.has(t)) return SYN.get(t);
  return t;
}

export function normalizeWord(w) {
  return (w || "").trim().replace(/\s+/g, "");
}


const TRAIL_STRIP = [
  "으로서","으로써","으로부터","로부터","으로","로","에서","에게서","에게","께서","께","까지","부터","만큼","같이","처럼","보다","조차","마저","라도","이나","나","이나마",
  "으로는","로는","에는","에선","에서는","에는","에서의","의","을","를","은","는","이","가","과","와","도","만","에","로","으로","서","께","한테","한테서"
];
function stripParticle(tok){
  tok = (tok||"").trim();
  if (tok.length < 2) return tok;
  for (const suf of TRAIL_STRIP){
    if (tok.length > suf.length && tok.endsWith(suf)){
      return tok.slice(0, tok.length - suf.length);
    }
  }
  return tok;
}

const CONCEPT = new Map([
  // 디자인/시각/꾸밈
  ["꾸미다","디자인"],["꾸밈","디자인"],["장식","디자인"],["장식하다","디자인"],
  ["그림","디자인"],["사진","디자인"],["도안","디자인"],["도면","디자인"],["미술","디자인"],["예술","디자인"],["패션","디자인"],["옷","디자인"],
  ["컴퓨터","디자인"],["프로그램","디자인"],["그래픽","디자인"],["포토샵","디자인"],["편집","디자인"],["이미지","디자인"],

  // 시간(즉시/짧은 간격)
  ["금방","짧은시간"],["방금","짧은시간"],["곧","짧은시간"],["즉시","짧은시간"],["당장","짧은시간"],["얼른","짧은시간"],
  ["순식간","짧은시간"],["잠시","짧은시간"],["찰나","짧은시간"],["금세","짧은시간"],["바로","짧은시간"],["즉각","짧은시간"],
  ["당장에","짧은시간"],["순간","짧은시간"],
  ["시간","짧은시간"],["때","짧은시간"],["시각","짧은시간"],["잠깐","짧은시간"],["조금","짧은시간"],["잠시후","짧은시간"],["곧바로","짧은시간"],

  // 시간 개념 확장
  ["시간","시간개념"],["순간","시간개념"],["간격","시간개념"],["기간","시간개념"],["잠깐","시간개념"],

  // 시간/연도
  ["올해","연도"],["금년","연도"],["다음해","연도"],["내년","연도"],["다다음해","연도"],["내후년","연도"],["작년","연도"],["전년","연도"],
]);

function expandConcepts(tokens){
  const out = [];
  for (const t0 of (tokens||[])){
    const t = normToken(stripParticle(t0));
    if (!t) continue;
    out.push(t);
    const c = CONCEPT.get(t);
    if (c) out.push(c);
  }
  return out;
}

function cosineBigrams(a,b){
  a = (a||""); b=(b||"");
  const A = bigramCounts(a);
  const B = bigramCounts(b);
  let dot=0, na=0, nb=0;
  for (const [k,v] of Object.entries(A)){ na += v*v; }
  for (const [k,v] of Object.entries(B)){ nb += v*v; }
  for (const [k,v] of Object.entries(A)){ if (B[k]) dot += v*B[k]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na)*Math.sqrt(nb));
}
function bigramCounts(s){
  // 한글/영문/숫자만 남기고 bigram
  const clean = (s||"").toLowerCase().replace(/[^0-9a-z가-힣]+/g," ");
  const grams = {};
  for (const part of clean.split(/\s+/)){
    if (!part) continue;
    const arr = toBigrams(part);
    for (const g of arr){
      grams[g]=(grams[g]||0)+1;
    }
  }
  return grams;
}

function tokenize(text) {
  text = text || "";
  const out = [];
  let m;
  while ((m = HANGUL_SEQ.exec(text)) !== null) {
    const w = m[0];
    if (!w) continue;
    if (w.length === 1 && !SINGLE_KEEP.has(w)) continue;
    if (STOP.has(w)) continue;
    out.push(normToken(stripParticle(w)));
  }
  HANGUL_SEQ.lastIndex = 0;
  return out;
}

function safeJsonArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ---------------- schema helpers ----------------
const _cache = { entriesCols: null, sensesCols: null };

async function tableColumns(DB, table) {
  const rows = await DB.prepare(`PRAGMA table_info(${table})`).all();
  const set = new Set();
  for (const r of rows?.results || []) {
    if (r?.name) set.add(String(r.name));
  }
  return set;
}

async function entriesColumns(DB) {
  if (_cache.entriesCols) return _cache.entriesCols;
  _cache.entriesCols = await tableColumns(DB, "entries");
  return _cache.entriesCols;
}

async function sensesColumns(DB) {
  if (_cache.sensesCols) return _cache.sensesCols;
  try {
    _cache.sensesCols = await tableColumns(DB, "senses");
  } catch {
    _cache.sensesCols = new Set();
  }
  return _cache.sensesCols;
}

function pickCol(cols, candidates, fallback = null) {
  for (const c of candidates) {
    if (c && cols.has(c)) return c;
  }
  if (fallback && cols.has(fallback)) return fallback;
  return null;
}

function mustCol(cols, candidates, label) {
  const c = pickCol(cols, candidates, null);
  if (!c) {
    throw new Error(
      `DB 스키마 불일치: ${label} 컬럼을 찾을 수 없어요. (candidates=${candidates.join(
        ","
      )})`
    );
  }
  return c;
}

// ---------------- senses loader (v1 schema 지원) ----------------
async function loadSenseByEntryId(DB, entryId) {
  const sCols = await sensesColumns(DB);
  if (!sCols || sCols.size === 0) return { definition: "", example: "" };

  const fk = pickCol(
    sCols,
    ["entry_id", "entryId", "eid", "entry", "entries_id", "entryid"],
    null
  );
  const defCol = pickCol(
    sCols,
    ["definition", "def", "mean", "meaning", "sense_definition", "definition_text"],
    null
  );
  const exCol = pickCol(
    sCols,
    ["example", "examples", "exam", "ex", "example_text", "example_sentence", "example1", "ex1"],
    null
  );
  const ord = pickCol(sCols, ["sense_no", "senseNo", "ord", "order_no", "order", "seq", "id"], null);

  if (!fk || !defCol) return { definition: "", example: "" };

  const select = [`${defCol} AS definition`, exCol ? `${exCol} AS example` : `'' AS example`].join(", ");
  const orderBy = ord ? `ORDER BY ${ord} ASC` : "";
  const sql = `SELECT ${select} FROM senses WHERE ${fk} = ? ${orderBy} LIMIT 1`;
  const row = await DB.prepare(sql).bind(entryId).first();
  return { definition: row?.definition || "", example: row?.example || "" };
}

// ---------------- core: pick daily answer ----------------
export async function pickDailyAnswer(DB, dateKey) {
  const cols = await entriesColumns(DB);

  const idCol = mustCol(cols, ["id", "entry_id", "entryId", "eid"], "id");
  const wordCol = mustCol(cols, ["word", "lemma", "headword", "entry"], "word");
  const posCol = pickCol(cols, ["pos", "part_of_speech", "pos_name", "posNm"], null);
  const levelCol = pickCol(cols, ["level", "difficulty", "lvl"], null);

  const hasDefinition = cols.has("definition");
  const hasExample = cols.has("example");
  const hasTokens = cols.has("tokens") && cols.has("rel_tokens");

  // count (가능하면 초급/중급 위주)
  let cntSql = "SELECT COUNT(*) AS c FROM entries";
  const whereLevel = levelCol ? ` WHERE ${levelCol} IN ('초급','중급','')` : "";
  if (levelCol) cntSql += whereLevel;

  const cntRow = await DB.prepare(cntSql).first();
  const c = cntRow?.c || 0;
  if (!c) return null;

  const offset = hash32("saitmal:" + dateKey) % c;

  const select = [
    `${idCol} AS id`,
    `${wordCol} AS word`,
    posCol ? `${posCol} AS pos` : `'' AS pos`,
    levelCol ? `${levelCol} AS level` : `'' AS level`,
    hasDefinition ? `definition AS definition` : `'' AS definition`,
    hasExample ? `example AS example` : `'' AS example`,
    hasTokens ? `tokens AS tokens` : `NULL AS tokens`,
    hasTokens ? `rel_tokens AS rel_tokens` : `NULL AS rel_tokens`,
  ].join(", ");

  const where = levelCol ? `WHERE ${levelCol} IN ('초급','중급','')` : "";
  const row = await DB.prepare(`SELECT ${select} FROM entries ${where} LIMIT 1 OFFSET ?`)
    .bind(offset)
    .first();
  if (!row) return null;

  let def = row.definition || "";
  let ex = row.example || "";

  // v1 schema: definition/example가 senses에 있을 수 있음
  if (!hasDefinition || !def || !hasExample || !ex) {
    const s = await loadSenseByEntryId(DB, row.id);
    if (!def) def = s.definition;
    if (!ex) ex = s.example;
  }

  const tokens = row.tokens ? safeJsonArray(row.tokens) : tokenize(def);
  const rel_tokens = row.rel_tokens ? safeJsonArray(row.rel_tokens) : tokenize(ex);

  return {
    id: row.id,
    word: row.word,
    pos: row.pos || "",
    level: row.level || "",
    definition: def,
    example: ex,
    tokens,
    rel_tokens,
  };
}


export function resolveKV(env){
  // Cloudflare Pages bindings may vary by name; support legacy and current bindings.
  // NOTE: some users set the binding name with a hyphen (e.g. "saitmal-kv"), so we also check bracket access.
  return (
    env?.SAITMAL_KV ||
    env?.TTEUTGYOP_KV ||      // legacy typo (TTEUTGYOP)
    env?.TTEUTGYEOP_KV ||     // legacy (TTEUTGYEOP)
    env?.saitmal_kv ||
    env?.["saitmal-kv"] ||
    env?.["TTEUTGYOP_KV"] ||
    env?.["TTEUTGYEOP_KV"] ||
    env?.["SAITMAL_KV"]
  );
}

// ---------------- answer cache (KV) ----------------
export async function getDailyAnswer(env, dateKey) {
  if (!env?.DB) throw new Error("D1 바인딩(DB)이 없어요.");
  const kv = resolveKV(env);
  const key = `answer:${dateKey}`;

  if (kv) {
    try {
      const cached = await kv.get(key);
      if (cached) {
        const v = JSON.parse(cached);
        if (v?.word) return v;
      }
    } catch {
      // ignore cache errors
    }
  }

  const ans = await pickDailyAnswer(env.DB, dateKey);
  if (!ans) return null;

  if (kv) {
    try {
      await kv.put(key, JSON.stringify(ans), { expirationTtl: 60 * 60 * 48 }); // 48h
    } catch {
      // ignore cache errors
    }
  }
  return ans;
}

// ---------------- lookup ----------------
export async function d1GetByWord(DB, word) {
  const q = normalizeWord(word);
  const cols = await entriesColumns(DB);
  const idCol = mustCol(cols, ["id", "entry_id", "entryId", "eid"], "id");
  const wordCol = mustCol(cols, ["word", "lemma", "headword", "entry"], "word");
  const posCol = pickCol(cols, ["pos", "part_of_speech", "pos_name", "posNm"], null);
  const levelCol = pickCol(cols, ["level", "difficulty", "lvl"], null);

  const hasDefinition = cols.has("definition");
  const hasExample = cols.has("example");
  const hasTokens = cols.has("tokens") && cols.has("rel_tokens");

  const select = [
    `${idCol} AS id`,
    `${wordCol} AS word`,
    posCol ? `${posCol} AS pos` : `'' AS pos`,
    levelCol ? `${levelCol} AS level` : `'' AS level`,
    hasDefinition ? `definition AS definition` : `'' AS definition`,
    hasExample ? `example AS example` : `'' AS example`,
    hasTokens ? `tokens AS tokens` : `NULL AS tokens`,
    hasTokens ? `rel_tokens AS rel_tokens` : `NULL AS rel_tokens`,
  ].join(", ");

  const row = await DB.prepare(`SELECT ${select} FROM entries WHERE ${wordCol} = ? LIMIT 1`)
    .bind(q)
    .first();
  if (!row) return null;

  let def = row.definition || "";
  let ex = row.example || "";
  if (!hasDefinition || !def || !hasExample || !ex) {
    const s = await loadSenseByEntryId(DB, row.id);
    if (!def) def = s.definition;
    if (!ex) ex = s.example;
  }

  const tokens = row.tokens ? safeJsonArray(row.tokens) : tokenize(def);
  const rel_tokens = row.rel_tokens ? safeJsonArray(row.rel_tokens) : tokenize(ex);

  return {
    id: row.id,
    word: row.word,
    pos: row.pos || "",
    level: row.level || "",
    definition: def,
    example: ex,
    tokens,
    rel_tokens,
  };
}

// ---------------- similarity ----------------
function toBigrams(word) {
  const w = normalizeWord(word);
  const grams = [];
  for (let i = 0; i < w.length - 1; i++) grams.push(w.slice(i, i + 2));
  return grams;
}

function jaccard(a, b) {
  const A = new Set(a || []);
  const B = new Set(b || []);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}

export function similarityScore(guess, answer) {
  // 표제어가 같으면 거의 동일
  const gw = normToken(guess?.word);
  const aw = normToken(answer?.word);
  if (gw && aw && gw === aw) return 1;

  // 토큰(정의/연관) 확장: 조사 제거 + 컨셉 매핑
  const gDef = expandConcepts(guess?.tokens || tokenize(guess?.definition||""));
  const aDef = expandConcepts(answer?.tokens || tokenize(answer?.definition||""));
  const gRel = expandConcepts(guess?.rel_tokens || tokenize(guess?.example||""));
  const aRel = expandConcepts(answer?.rel_tokens || tokenize(answer?.example||""));

  // 1) 정의 토큰 자카드
  const sDef = jaccard(gDef, aDef);
  // 2) 예문/연관 토큰 자카드
  const sRel = jaccard(gRel, aRel);
  // 3) 정의 텍스트의 문자 bigram cosine (표현이 달라도 가까운 문장 패턴 보정)
  const sChar = cosineBigrams(guess?.definition||"", answer?.definition||"");
  // 4) 표제어(단어) 글자 bigram
  const sW = jaccard(toBigrams(guess?.word), toBigrams(answer?.word));
  // 5) 표제어 토큰(내년/올해 등) - 조사 제거 후
  const sWTok = jaccard(expandConcepts(tokenize(guess?.word)), expandConcepts(tokenize(answer?.word)));

  // 가중치(휴리스틱): 사람 기준 '연상되는 단어'를 더 잘 올리기 위해
  // - 의미 토큰(정의/예문/컨셉) 비중을 높이고
  // - 문자 유사도(문장 패턴, 철자) 비중을 낮춤
    const score = 0.65 * sDef + 0.25 * sRel + 0.10 * sWTok;
  // 낮은 점수(우연한 겹침)는 0%로 눌러서 납득 가능한 결과를 유지
  return score < 0.03 ? 0 : score;
}

// 점수를 %로 변환(낮은 점수도 0%에 눌리지 않도록 비선형 스케일)
export function scoreToPercent(score, { isCorrect = false } = {}) {
  let s = Number.isFinite(score) ? score : 0;
  if (s < 0) s = 0;
  if (s > 1) s = 1;
  if (isCorrect) return 100;
  if (s <= 0) return 0;

  // 0~1을 0~100으로: pow(<1)로 저점 확장
  let p = Math.round(100 * Math.pow(s, 0.65));
  if (p >= 100) p = 99; // 정답 제외
  if (p < 0) p = 0;
  if (p > 99) p = 99;
  return p;
}

// ---- DB Top-N (정답 제외) 캐시 ----
export async function getDbTop(env, dateKey, { limit = 10 } = {}) {
  if (!env?.DB) throw new Error("D1 바인딩(DB)이 없어요.");
  const kv = resolveKV(env);
  const cacheKey = `saitmal:top10:${dateKey}`;

  // KV cache
  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const v = JSON.parse(cached);
        if (v?.items?.length) {
          return { dateKey, answer: v.answer || null, items: v.items.slice(0, limit) };
        }
      }
    } catch {
      // ignore cache errors
    }
  }

  // need answer
  const ans = await getDailyAnswer(env, dateKey);
  if (!ans) return { dateKey, answer: null, items: [] };

  // schema detect (entries/senses)
  async function tableColumns(DB, table) {
    try {
      const { results } = await DB.prepare(`PRAGMA table_info(${table});`).all();
      return new Set((results || []).map(r => String(r.name || "").toLowerCase()));
    } catch {
      return new Set();
    }
  }
  function pickCol(cols, names, fallback = null) {
    for (const n of names) {
      const k = String(n).toLowerCase();
      if (cols.has(k)) return n;
    }
    return fallback;
  }

  const eCols = await tableColumns(env.DB, "entries");
  const sCols = await tableColumns(env.DB, "senses");

  const eId = pickCol(eCols, ["id", "entry_id", "entryid", "eid"], "id");
  const eWord = pickCol(eCols, ["word", "lemma", "headword", "entry"], "word");
  const ePos = pickCol(eCols, ["pos", "part_of_speech", "pos_name", "posnm"], null);
  const eLevel = pickCol(eCols, ["level", "difficulty", "lvl"], null);

  const eDef = pickCol(eCols, ["definition", "def", "mean", "meaning", "definition_text"], null);
  const eEx = pickCol(eCols, ["example", "ex", "sample", "usage", "example_text"], null);

  const sFk = pickCol(sCols, ["entry_id", "entryid", "eid", "entry", "entries_id"], null);
  const sDef = pickCol(sCols, ["definition", "def", "mean", "meaning", "sense_definition", "definition_text"], null);
  const sEx = pickCol(sCols, ["example", "ex", "sample", "usage", "example_text"], null);
  const sOrd = pickCol(sCols, ["sense_order", "ord", "order", "seq", "no", "idx"], null);

  const senseOrder = sOrd ? `ORDER BY s.${sOrd} ASC, s.rowid ASC` : `ORDER BY s.rowid ASC`;
  const defExpr = eDef ? `e.${eDef}` : (sFk && sDef ? `(SELECT s.${sDef} FROM senses s WHERE s.${sFk}=e.${eId} ${senseOrder} LIMIT 1)` : "NULL");
  const exExpr = eEx ? `e.${eEx}` : (sFk && sEx ? `(SELECT s.${sEx} FROM senses s WHERE s.${sFk}=e.${eId} ${senseOrder} LIMIT 1)` : "NULL");

  // candidates: random sample (속도 우선)
  const SAMPLE = 2000;
  const sql = `
    SELECT e.${eId} AS id,
           e.${eWord} AS word
           ${ePos ? `, e.${ePos} AS pos` : ", NULL AS pos"}
           ${eLevel ? `, e.${eLevel} AS level` : ", NULL AS level"}
           , ${defExpr} AS definition
           , ${exExpr} AS example
    FROM entries e
    ORDER BY RANDOM()
    LIMIT ${SAMPLE}
  `;
  const rows = (await env.DB.prepare(sql).all()).results || [];

  const items = [];
  for (const r of rows) {
    const w = normalizeWord(r.word);
    if (!w || w === normalizeWord(ans.word)) continue;

    const guess = {
      word: w,
      pos: r.pos || "",
      level: r.level || "",
      definition: r.definition || "",
      example: r.example || "",
    };

    const score = similarityScore(guess, ans);
    const percent = scoreToPercent(score, { isCorrect: false });
    items.push({ word: w, percent });
  }

  items.sort((a, b) => (b.percent - a.percent) || a.word.localeCompare(b.word, "ko"));
  const topAll = items.slice(0, Math.max(10, limit));

  // write cache
  if (kv) {
    try {
      await kv.put(
        cacheKey,
        JSON.stringify({ answer: { word: ans.word, pos: ans.pos || "", level: ans.level || "" }, items: topAll }),
        { expirationTtl: 60 * 60 * 24 * 2 }
      );
    } catch {
      // ignore
    }
  }

  return { dateKey, answer: { word: ans.word, pos: ans.pos || "", level: ans.level || "" }, items: topAll.slice(0, limit) };
}
