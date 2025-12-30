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

function tokenize(text) {
  text = text || "";
  const out = [];
  let m;
  while ((m = HANGUL_SEQ.exec(text)) !== null) {
    const w = m[0];
    if (!w) continue;
    if (w.length === 1 && !SINGLE_KEEP.has(w)) continue;
    if (STOP.has(w)) continue;
    out.push(normToken(w));
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

// ---------------- answer cache (KV) ----------------
export async function getDailyAnswer(env, dateKey) {
  if (!env?.DB) throw new Error("D1 바인딩(DB)이 없어요.");
  const kv = env?.TTEUTGYOP_KV;
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
  // 1) 정의 토큰 유사 (사람이 느끼는 의미 유사에 가장 근접)
  const sDef = jaccard(guess?.tokens, answer?.tokens);
  // 2) 예문/연관 토큰 유사
  const sRel = jaccard(guess?.rel_tokens, answer?.rel_tokens);
  // 3) 표제어(단어) 글자 빅그램 유사 (동형/부분 유사 보정)
  const sW = jaccard(toBigrams(guess?.word), toBigrams(answer?.word));

  // 가중치: 정의 0.70 + 예문 0.20 + 표제어 0.10
  return 0.7 * sDef + 0.2 * sRel + 0.1 * sW;
}