export function percentFromRank(rank, TOP_K = 3000) {
  if (rank == null) return 0;
  const x = (rank - 1) / (TOP_K - 1);
  const curved = Math.pow(1 - x, 1.35);
  return Math.max(0, Math.round(curved * 100));
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function ensureAnswerRankSchema(env) {
  const info = await env.DB.prepare(`PRAGMA table_info(answer_rank);`).all();
  const cols = new Set((info?.results ?? []).map(r => r.name));

  if (!cols.has('display_word')) {
    try { await env.DB.prepare(`ALTER TABLE answer_rank ADD COLUMN display_word TEXT;`).run(); }
    catch (_) {}
  }
  if (!cols.has('pos')) {
    try { await env.DB.prepare(`ALTER TABLE answer_rank ADD COLUMN pos TEXT;`).run(); }
    catch (_) {}
  }

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_answer_rank_date_rank_word
    ON answer_rank(date_key, rank, word_id);
  `).run();
}

export async function buildAnswerRank({ env, dateKey, answerWordId }) {
  const TOPK = Number(env.RANK_TOPK ?? 3000);
  const CAND_LIMIT = Number(env.RANK_CANDIDATE_LIMIT ?? 8000);

  // D1 변수 제한 대비: IN(...) 최대 바인딩 개수(안전값)
  const MAX_IN_VARS = 80;

  await ensureAnswerRankSchema(env);

  const defs = await env.DB.prepare(`
    SELECT definition FROM answer_sense WHERE word_id = ?
  `).bind(answerWordId).all();

  if (!defs?.results?.length) {
    return { ok: false, message: "정답 정의 없음" };
  }

  const tokens = Array.from(new Set(
    defs.results
      .flatMap(r => (r.definition || "").split(/\s+/))
      .map(t => t.trim())
      .filter(t => t.length >= 1)
  )).slice(0, 20);

  if (!tokens.length) {
    return { ok: false, message: "MATCH 토큰 없음" };
  }

  const match = tokens.map(t => `"${t.replace(/"/g, "")}"`).join(" OR ");

  const rows = await env.DB.prepare(`
    SELECT word_id, MIN(score) AS score
    FROM (
      SELECT word_id, bm25(answer_sense_fts) AS score
      FROM answer_sense_fts
      WHERE answer_sense_fts MATCH ?
      LIMIT ?
    )
    GROUP BY word_id
    ORDER BY score
    LIMIT ?
  `).bind(match, CAND_LIMIT * 3, CAND_LIMIT).all();

  const cand = rows?.results ?? [];
  if (!cand.length) {
    return { ok: false, message: "후보군 추출 실패(0건)" };
  }

  await env.DB.prepare(`DELETE FROM answer_rank WHERE date_key = ?`)
    .bind(dateKey).run();

  const top = cand.slice(0, TOPK);
  const ids = top.map(r => r.word_id);
  const meta = new Map();

  // MAX_IN_VARS 단위로 lex_entry 조회 (변수 제한 회피)
  for (const chunk of chunkArray(ids, MAX_IN_VARS)) {
    const placeholders = chunk.map(() => '?').join(',');
    const lex = await env.DB.prepare(`
      SELECT entry_id, display_word, pos
      FROM lex_entry
      WHERE entry_id IN (${placeholders})
    `).bind(...chunk).all();

    for (const r of (lex?.results ?? [])) {
      meta.set(r.entry_id, { display_word: r.display_word, pos: r.pos });
    }
  }

  const statements = [];
  let rank = 1;
  for (const r of top) {
    const m = meta.get(r.word_id) ?? { display_word: null, pos: null };
    statements.push(
      env.DB.prepare(`
        INSERT INTO answer_rank(date_key, word_id, rank, score, display_word, pos)
        VALUES(?,?,?,?,?,?)
      `).bind(dateKey, r.word_id, rank++, r.score, m.display_word, m.pos)
    );
  }

  for (const chunk of chunkArray(statements, 100)) {
    await env.DB.batch(chunk);
  }

  return { ok: true, count: statements.length };
}
