function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const STOPWORDS = new Set([
  '것','수','등','따위','따라','위해','대한','관련','경우','대해','때','및','또는',
  '하다','되다','있다','없다','이다','아니다','같다','된다','한다','있음','없음',
  '사람','말','일','데','그','이','저',
]);

async function ensureAnswerRankSchema(env) {
  const info = await env.DB.prepare(`PRAGMA table_info(answer_rank);`).all();
  const cols = new Set((info?.results ?? []).map(r => r.name));

  const addCol = async (name, ddl) => {
    if (cols.has(name)) return;
    try { await env.DB.prepare(ddl).run(); } catch (_) {}
  };

  await addCol('display_word', `ALTER TABLE answer_rank ADD COLUMN display_word TEXT;`);
  await addCol('pos', `ALTER TABLE answer_rank ADD COLUMN pos TEXT;`);
  await addCol('percent', `ALTER TABLE answer_rank ADD COLUMN percent REAL;`);

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_answer_rank_date_rank_word
    ON answer_rank(date_key, rank, word_id);
  `).run();
}

async function ensureVocab(env) {
  try {
    await env.DB.prepare(`
      CREATE VIRTUAL TABLE IF NOT EXISTS answer_sense_fts_vocab
      USING fts5vocab(answer_sense_fts, 'row');
    `).run();
    return true;
  } catch (_) {
    return false;
  }
}

async function fetchMetaFromAnswerPool(env, ids) {
  const MAX_IN_VARS = 80;
  const meta = new Map();

  for (const chunk of chunkArray(ids, MAX_IN_VARS)) {
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT word_id, display_word, pos
      FROM answer_pool
      WHERE word_id IN (${placeholders})
    `).bind(...chunk).all();

    for (const r of (rows?.results ?? [])) {
      meta.set(r.word_id, { display_word: r.display_word, pos: r.pos });
    }
  }
  return meta;
}

function extractCandidateTokens(defTexts) {
  const toks = [];
  for (const t of defTexts) {
    const parts = (t || '').split(/\s+/);
    for (let p of parts) {
      p = p.replace(/[^\p{Script=Hangul}\p{L}\p{N}]/gu, '').trim();
      if (p.length < 2) continue;
      if (STOPWORDS.has(p)) continue;
      toks.push(p);
    }
  }
  return toks;
}

function extractCandidatePhrases(defTexts) {
  // 간단한 2-그램 구(띄어쓰기 기반). 너무 길게 안 가고, 의미 약한 것 제외.
  const phrases = [];
  for (const t of defTexts) {
    const parts = (t || '')
      .split(/\s+/)
      .map(p => p.replace(/[^\p{Script=Hangul}\p{L}\p{N}]/gu, '').trim())
      .filter(p => p.length >= 2 && !STOPWORDS.has(p));
    for (let i = 0; i < parts.length - 1; i++) {
      const a = parts[i], b = parts[i+1];
      if (!a || !b) continue;
      // 너무 범용적인 조합은 제외
      if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
      phrases.push(`${a} ${b}`);
    }
  }
  return phrases;
}

async function smartTopTokens(env, defTexts, limit = 12) {
  const ok = await ensureVocab(env);
  if (!ok) return null;

  const tokens = extractCandidateTokens(defTexts);
  if (!tokens.length) return null;

  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

  let N = 0;
  try {
    const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM answer_sense_fts;`).first();
    N = Number(c?.n ?? 0);
  } catch (_) {}
  if (!N) return null;

  const uniq = Array.from(tf.keys()).slice(0, 80);
  const MAX_IN_VARS = 80;

  const df = new Map();
  for (const chunk of chunkArray(uniq, MAX_IN_VARS)) {
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT term, doc
      FROM answer_sense_fts_vocab
      WHERE term IN (${placeholders})
    `).bind(...chunk).all();
    for (const r of (rows?.results ?? [])) df.set(r.term, Number(r.doc ?? 0));
  }

  const scored = [];
  for (const [term, f] of tf.entries()) {
    const d = df.get(term) || 0;
    const idf = Math.log((N + 1) / (d + 1));
    const score = f * idf;
    if (idf < 0.6) continue;
    scored.push({ term, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).map(x => x.term);
  return top.length ? top : null;
}

function buildMatch(tokens, phrases) {
  // AND 중심 + 보조 OR + (가능하면) 구(phrase) OR
  const andPart = tokens.slice(0, 5).map(t => `"${t.replace(/"/g, "")}"`).join(" AND ");
  const orPartTokens = tokens.slice(5, 12);
  const orPart = orPartTokens.length
    ? `(${orPartTokens.map(t => `"${t.replace(/"/g, "")}"`).join(" OR ")})`
    : null;

  const phrasePartTokens = (phrases || []).slice(0, 3).map(p => `"${p.replace(/"/g, "")}"`);
  const phrasePart = phrasePartTokens.length ? `(${phrasePartTokens.join(" OR ")})` : null;

  if (orPart && phrasePart) return `(${andPart}) AND (${orPart} OR ${phrasePart})`;
  if (orPart) return `(${andPart}) AND ${orPart}`;
  if (phrasePart) return `(${andPart}) AND ${phrasePart}`;
  return andPart;
}

function buildKeywordSet(tokens, phrases) {
  // 리랭킹용: 단어 토큰 + 구(phrase)를 키워드로 사용
  const set = new Set();
  for (const t of tokens) set.add(t);
  for (const p of (phrases || []).slice(0, 5)) set.add(p);
  return set;
}

async function fetchDefinitionsForWordIds(env, ids) {
  // word_id별 definition 합치기
  const MAX_IN_VARS = 80;
  const defs = new Map();

  for (const chunk of chunkArray(ids, MAX_IN_VARS)) {
    const placeholders = chunk.map(() => '?').join(',');
    // group_concat은 sense 여러 개를 한 텍스트로 합쳐줌
    const rows = await env.DB.prepare(`
      SELECT word_id, group_concat(definition, ' ') AS defs
      FROM answer_sense
      WHERE word_id IN (${placeholders})
      GROUP BY word_id
    `).bind(...chunk).all();

    for (const r of (rows?.results ?? [])) {
      defs.set(r.word_id, String(r.defs ?? ''));
    }
  }
  return defs;
}

function humanOverlapScore(text, keywordSet) {
  // 사람이 납득하는 느낌: "정답의 핵심어/구가 후보 뜻에 얼마나 직접 나타나는가"
  // - 토큰은 부분문자열 포함으로 판단(한국어는 형태변화가 있으니)
  // - 구(phrase)는 더 높은 가중치
  if (!text) return 0;
  let score = 0;
  for (const k of keywordSet) {
    if (!k) continue;
    const isPhrase = k.includes(' ');
    if (text.includes(k)) score += isPhrase ? 2.5 : 1.0;
  }
  return score;
}

/**
 * Build ranks using FTS + "human overlap" rerank and store topK with percent.
 */
export async function buildAnswerRank({ env, dateKey, answerWordId, answerPos = null }) {
  const TOPK = Number(env.RANK_TOPK ?? 3000);
  const CAND_LIMIT = Number(env.RANK_CANDIDATE_LIMIT ?? 12000);
  const RERANK_N = Number(env.RANK_RERANK_N ?? 1200);

  await ensureAnswerRankSchema(env);

  const defs = await env.DB.prepare(`
    SELECT definition FROM answer_sense WHERE word_id = ?
  `).bind(answerWordId).all();

  if (!defs?.results?.length) {
    return { ok: false, message: "정답 정의 없음" };
  }

  const defTexts = defs.results.map(r => r.definition || '');

  // ✅ 스마트 토큰(희소성 기반) + 구(phrase)
  let tokens = await smartTopTokens(env, defTexts, 12);
  if (!tokens) {
    const raw = extractCandidateTokens(defTexts);
    tokens = Array.from(new Set(raw)).slice(0, 12);
  }
  const phrases = Array.from(new Set(extractCandidatePhrases(defTexts))).slice(0, 10);

  if (!tokens.length) {
    return { ok: false, message: "MATCH 토큰 없음" };
  }

  const match = buildMatch(tokens, phrases);

  // 1차 후보: bm25
  const stmt = env.DB.prepare(`
    SELECT s.word_id, MIN(s.score) AS score
    FROM (
      SELECT f.word_id, bm25(answer_sense_fts) AS score
      FROM answer_sense_fts f
      WHERE f MATCH ?
      LIMIT ?
    ) s
    ${answerPos ? "JOIN answer_pool ap ON ap.word_id = s.word_id AND ap.pos = ?" : ""}
    GROUP BY s.word_id
    ORDER BY score
    LIMIT ?
  `);

  const bindArgs = answerPos
    ? [match, CAND_LIMIT * 3, answerPos, CAND_LIMIT]
    : [match, CAND_LIMIT * 3, CAND_LIMIT];

  const rows = await stmt.bind(...bindArgs).all();
  const cand = rows?.results ?? [];
  if (!cand.length) {
    return { ok: false, message: "후보군 추출 실패(0건)", tokens, phrases, match };
  }

  // ✅ 2차 리랭킹: 상위 일부만 정의 겹침 점수로 재정렬
  const rerankBase = cand.slice(0, Math.min(RERANK_N, cand.length));
  const rerankIds = rerankBase.map(r => r.word_id);
  const candDefs = await fetchDefinitionsForWordIds(env, rerankIds);

  const keywordSet = buildKeywordSet(tokens, phrases);

  // bm25 score는 작을수록 좋음(더 음수). overlap은 클수록 좋음.
  // 결합 점수: normBm25 + overlapWeight*overlap
  // - normBm25는 0~1로 정규화(좋을수록 1)
  let bestScore = rerankBase[0].score;
  let worstScore = bestScore;
  for (const r of rerankBase) worstScore = Math.max(worstScore, r.score);
  const denom = (worstScore - bestScore) || 1;

  const overlapWeight = 0.18; // 과하면 키워드 나열 단어가 올라오므로 보수적으로
  const reranked = rerankBase.map(r => {
    const normBm25 = (worstScore - r.score) / denom; // 0..1
    const d = candDefs.get(r.word_id) || '';
    const ov = humanOverlapScore(d, keywordSet);
    const combined = normBm25 + overlapWeight * ov;
    return { ...r, _combined: combined, _ov: ov };
  });

  reranked.sort((a, b) => b._combined - a._combined);

  // 리랭킹된 상단 + 나머지(리랭킹 안 한 후보)는 뒤에 그대로 붙이기
  const used = new Set(reranked.map(r => r.word_id));
  const tail = cand.filter(r => !used.has(r.word_id));
  const merged = reranked.concat(tail);

  // 저장은 topK만
  const top = merged.slice(0, TOPK);
  const ids = top.map(r => r.word_id);
  const meta = await fetchMetaFromAnswerPool(env, ids);

  // percent는 bm25 점수 범위 기준(리랭킹 후에도 bm25 기반 percent 유지)
  // 사람이 느끼는 "점수"는 일관되어야 해서 percent는 bm25로 계산
  bestScore = top[0].score;
  worstScore = bestScore;
  for (const r of top) worstScore = Math.max(worstScore, r.score);
  const denom2 = (worstScore - bestScore) || 1;

  await env.DB.prepare(`DELETE FROM answer_rank WHERE date_key = ?`).bind(dateKey).run();

  const statements = [];
  let rank = 1;
  for (const r of top) {
    const m = meta.get(r.word_id) ?? { display_word: null, pos: null };
    let pct = ((worstScore - r.score) / denom2) * 100;
    pct = round2(clamp(pct, 0, 100));

    // ✅ 규칙: 정답만 100.00, 나머지는 최대 99.99
    if (rank === 1) pct = 100.00;
    else if (pct >= 100) pct = 99.99;

    statements.push(
      env.DB.prepare(`
        INSERT INTO answer_rank(date_key, word_id, rank, score, display_word, pos, percent)
        VALUES(?,?,?,?,?,?,?)
      `).bind(dateKey, r.word_id, rank++, r.score, m.display_word, m.pos, pct)
    );
  }

  for (const chunk of chunkArray(statements, 100)) {
    await env.DB.batch(chunk);
  }

  const missing = ids.filter(id => !meta.has(id)).length;
  return {
    ok: true,
    count: statements.length,
    metaMissing: missing,
    tokens,
    phrases: phrases.slice(0, 5),
    match,
    rerankN: rerankBase.length
  };
}
