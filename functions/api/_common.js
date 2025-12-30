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
const STOP = new Set(["그리고", "그래서", "하지만", "그러나", "또는", "및", "등", "것", "것들", "사람", "사람들", "경우", "때문", "위해", "대한", "관련", "있다", "없다", "하다", "되다", "하게", "하기", "했다", "했다", "한다", "된다", "이다", "이며", "이고", "이다며", "한다며", "그것", "이것", "저것", "여기", "저기", "거기", "어떤", "이러한", "그런", "저런", "같은", "말", "일", "것임", "정도", "수", "등등", "때", "동안", "사이", "이후", "이전", "전후", "모두", "모든", "각", "여러", "여러가지", "사용", "쓰다", "쓰이다", "이용", "대하다", "관한", "포함", "및또", "또한", "더", "더욱", "매우", "정말"]);

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


// 매우 빈번한 토큰(정의 어디에나 나와서 유사도를 망치는 것들)
// - STOP과 별개로 "의미 판별"에서만 추가로 제외
const COMMON = new Set([
  "사람","가축","동물","식물","것","일","말","수","때","곳","모양","상태","방법","경우",
  "사용","쓰다","쓰이다","이용","하여","해서","하며","한다","되는","된다","이다",
  "어떤","이러한","그런","같은","정도","모두","모든","여러","가능","불가능",
  "하다","되다","있다","없다","위해","대한","관련","포함","가리키다","뜻하다"
]);
// CONCEPT 값(개념 토큰) 집합: '짧은시간' 같은 개념 겹침을 강하게 보상하기 위함
const CONCEPT_VALUES = new Set(Array.from(new Set(Array.from(CONCEPT.values()))));

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
  HANGUL_SEQ.lastIndex = 0;
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

function overlapCoeff(a, b) {
  const A = new Set(a || []);
  const B = new Set(b || []);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const denom = Math.min(A.size, B.size);
  return denom ? inter / denom : 0;
}


function informativeIntersection(aTokens, bTokens) {
  const a = new Set((aTokens||[]).filter(t=>t && t.length>=2 && !STOP.has(t) && !COMMON.has(t) && !CONCEPT_VALUES.has(t)));
  const b = new Set((bTokens||[]).filter(t=>t && t.length>=2 && !STOP.has(t) && !COMMON.has(t) && !CONCEPT_VALUES.has(t)));
  let n=0;
  for (const t of a) if (b.has(t)) n++;
  return n;
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

  // 1) 정의 토큰 유사도: Jaccard + overlap(짧은 정의/동의어에 유리)
  const sDef = Math.max(jaccard(gDef, aDef), overlapCoeff(gDef, aDef));
  // 2) 예문/연관 토큰 유사도
  const sRel = Math.max(jaccard(gRel, aRel), overlapCoeff(gRel, aRel));
  // 3) 정의 텍스트의 문자 bigram cosine (표현이 달라도 가까운 문장 패턴 보정)
  const sChar = cosineBigrams(guess?.definition||"", answer?.definition||"");
  // 4) 표제어(단어) 글자 bigram
  const sW = jaccard(toBigrams(guess?.word), toBigrams(answer?.word));
  // 5) 표제어 토큰(내년/올해 등) - 조사 제거 후
  const sWTok = Math.max(
    jaccard(expandConcepts(tokenize(guess?.word)), expandConcepts(tokenize(answer?.word))),
    overlapCoeff(expandConcepts(tokenize(guess?.word)), expandConcepts(tokenize(answer?.word)))
  );

  // 6) 개념 토큰 유사도(사람이 느끼는 연상/동의어를 크게 끌어올림)
  const gAll = expandConcepts([
    ...tokenize(guess?.word || ""),
    ...(guess?.tokens || tokenize(guess?.definition || "")),
    ...(guess?.rel_tokens || tokenize(guess?.example || "")),
  ]);
  const aAll = expandConcepts([
    ...tokenize(answer?.word || ""),
    ...(answer?.tokens || tokenize(answer?.definition || "")),
    ...(answer?.rel_tokens || tokenize(answer?.example || "")),
  ]);
  const gC = gAll.filter(t => CONCEPT_VALUES.has(t));
  const aC = aAll.filter(t => CONCEPT_VALUES.has(t));
  const sConcept = Math.max(jaccard(gC, aC), overlapCoeff(gC, aC));

  // 품사 불일치 페널티(둘 다 있을 때만)
  let posPenalty = 1;
  const gp = (guess?.pos || "").trim();
  const ap = (answer?.pos || "").trim();
  if (gp && ap && gp !== ap) posPenalty = 0.55;

  // 가중치(휴리스틱): 사람 기준 '연상되는 단어' 비중을 높임
  // - 정의/예문/컨셉 토큰 중심
  // - 표제어 철자 유사도는 보조

  // '의미 없는 공통어(사람/것/하다...)' 겹침으로 점수가 튀는 것을 억제
  const sharedInfo = informativeIntersection([...gDef, ...gRel], [...aDef, ...aRel]);
  // 유의미한 공통 토큰이 거의 없으면(=연관성이 약함) 정의/예문 기반 점수를 상한 처리
  const defCap = sharedInfo >= 2 ? 1 : 0.18;
  const relCap = sharedInfo >= 2 ? 1 : 0.18;
  const sDef2 = Math.min(sDef, defCap);
  const sRel2 = Math.min(sRel, relCap);
  const score = posPenalty * (
    0.35 * sConcept +
    0.35 * sDef2 +
    0.20 * sRel2 +
    0.10 * sWTok
  );

  // 낮은 점수(우연한 겹침)는 0으로 눌러서 납득 가능한 결과 유지
  return score < 0.05 ? 0 : score;
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

// 일일 스케일(= DB에서 뽑은 Top 후보 중 최고 raw score)을 이용해 %를 상대적으로 환산
export function scoreToPercentScaled(score, maxRaw, { isCorrect = false } = {}) {
  if (isCorrect) return 100;
  const s = Number.isFinite(score) ? score : 0;
  const m = Number.isFinite(maxRaw) ? maxRaw : 0;
  if (s <= 0 || m <= 0) return 0;
  // 최고 후보(정답 제외)가 99%가 되도록 선형 스케일
  let p = Math.round(99 * (s / m));
  if (p < 0) p = 0;
  if (p > 99) p = 99;
  return p;
}

// ---- DB Top-N (정답 제외) 캐시 ----

// ---- DB Top cache (정답 제외) ----
// - 한 날짜에 1회 계산하고 KV에 저장
// - guess/meta/top에서 공통 사용
export async function getDbTop(env, dateKey, { limit = 10 } = {}) {
  if (!env?.DB) throw new Error("D1 바인딩(DB)이 없어요.");
  const kv = resolveKV(env);
  const cacheKey = `saitmal:topcache:${dateKey}`;

  // 1) KV cache
  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const v = JSON.parse(cached);
        if (v?.items?.length) {
          return {
            dateKey,
            answer: v.answer || null,
            maxRaw: v.maxRaw || 0,
            items: v.items.slice(0, limit),
            map: v.map || null,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // 2) build cache
  const ans = await getDailyAnswer(env, dateKey);
  if (!ans) return { dateKey, answer: null, items: [], maxRaw: 0, map: null };

  const eCols = await entriesColumns(env.DB);
  const sCols = await sensesColumns(env.DB);

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
  const exExpr  = eEx  ? `e.${eEx}`  : (sFk && sEx  ? `(SELECT s.${sEx}  FROM senses s WHERE s.${sFk}=e.${eId} ${senseOrder} LIMIT 1)` : "NULL");

  // 2-1) 개념(컨셉) 기반 seed 단어(정답과 "같은 의미군"으로 묶인 단어들)
  const conceptKey = CONCEPT.get(ans.word) || null;
  const seeds = [];
  if (conceptKey) {
    for (const [k,v] of CONCEPT.entries()){
      if (v === conceptKey && k !== ans.word) seeds.push(k);
    }
  }

  // 2-2) 정의/예문에서 '정보성 높은 토큰'만 추출(공통어/STOP 제거)
  const aTokensAll = Array.from(new Set(tokenize((ans.definition || "") + " " + (ans.example || ""))))
    .map(t => normToken(t))
    .filter(t => t && t.length >= 2 && t !== ans.word && !STOP.has(t) && !COMMON.has(t))
    .slice(0, 6);

  const rows = [];
  const seenId = new Set();

  async function pushRows(res){
    for (const r of (res?.results || [])) {
      if (r?.id == null) continue;
      const id = Number(r.id);
      if (seenId.has(id)) continue;
      seenId.add(id);
      rows.push(r);
    }
  }

  // (A) seed 단어: word IN (...)
  if (seeds.length) {
    const inList = seeds.slice(0, 40);
    const qs = inList.map(()=>"?").join(",");
    const sql = `
      SELECT e.${eId} AS id,
             e.${eWord} AS word
             ${ePos ? `, e.${ePos} AS pos` : ", NULL AS pos"}
             ${eLevel ? `, e.${eLevel} AS level` : ", NULL AS level"}
             , ${defExpr} AS definition
             , ${exExpr} AS example
      FROM entries e
      WHERE e.${eWord} IN (${qs})
    `;
    await pushRows(await env.DB.prepare(sql).bind(...inList).all());
  }

  // (B) 정의/예문 LIKE 검색(너무 공통적인 토큰은 제외)
  if (aTokensAll.length && sFk && sDef) {
    const where = aTokensAll.map(()=>`s.${sDef} LIKE ?`).join(" OR ");
    const params = aTokensAll.map(t=>`%${t}%`);
    const sql = `
      SELECT DISTINCT e.${eId} AS id,
             e.${eWord} AS word
             ${ePos ? `, e.${ePos} AS pos` : ", NULL AS pos"}
             ${eLevel ? `, e.${eLevel} AS level` : ", NULL AS level"}
             , ${defExpr} AS definition
             , ${exExpr} AS example
      FROM senses s
      JOIN entries e ON e.${eId}=s.${sFk}
      WHERE (${where})
      LIMIT 6000
    `;
    await pushRows(await env.DB.prepare(sql).bind(...params).all());
  } else if (aTokensAll.length && eDef) {
    const where = aTokensAll.map(()=>`e.${eDef} LIKE ?`).join(" OR ");
    const params = aTokensAll.map(t=>`%${t}%`);
    const sql = `
      SELECT e.${eId} AS id,
             e.${eWord} AS word
             ${ePos ? `, e.${ePos} AS pos` : ", NULL AS pos"}
             ${eLevel ? `, e.${eLevel} AS level` : ", NULL AS level"}
             , ${defExpr} AS definition
             , ${exExpr} AS example
      FROM entries e
      WHERE (${where})
      LIMIT 6000
    `;
    await pushRows(await env.DB.prepare(sql).bind(...params).all());
  }

  // (C) 보강 샘플(희귀 정의 / seed 없음 대비)
  if (rows.length < 3000) {
    const need = Math.max(0, 5000 - rows.length);
    if (need > 0) {
      const sql2 = `
        SELECT e.${eId} AS id,
               e.${eWord} AS word
               ${ePos ? `, e.${ePos} AS pos` : ", NULL AS pos"}
               ${eLevel ? `, e.${eLevel} AS level` : ", NULL AS level"}
               , ${defExpr} AS definition
               , ${exExpr} AS example
        FROM entries e
        ORDER BY RANDOM()
        LIMIT ${need}
      `;
      await pushRows(await env.DB.prepare(sql2).all());
    }
  }

  // 2-3) score all candidates
  const scored = [];
  for (const r of rows) {
    const w = (r.word || "").trim();
    if (!w || w === ans.word) continue;
    const g = {
      word: w,
      pos: r.pos || null,
      level: r.level || null,
      definition: r.definition || "",
      example: r.example || "",
    };
    const raw = similarityScore(g, ans);
    if (raw <= 0) continue;
    scored.push({ word: w, raw });
  }

  scored.sort((a,b)=>b.raw-a.raw);
  const maxRaw = scored.length ? scored[0].raw : 0;

  // 상위 1000개 저장(랭크/빠른 조회용)
  const topN = scored.slice(0, 1000).map((x,i)=>({
    rank: i+1,
    word: x.word,
    raw: x.raw,
    percent: scoreToPercentScaled(x.raw, maxRaw, { isCorrect:false }),
  }));

  // word -> rank/percent 맵
  const map = {};
  for (const it of topN) {
    map[it.word] = { rank: it.rank, percent: it.percent, raw: it.raw };
  }

  const payload = {
    answer: { word: ans.word, pos: ans.pos || null, level: ans.level || null },
    maxRaw,
    items: topN,
    map,
  };

  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60*60*48 });
    } catch {
      // ignore
    }
  }

  return { dateKey, answer: payload.answer, maxRaw, items: topN.slice(0, limit), map };
}
