
export function percentFromRank(rank, TOP_K = 3000) {
  if (rank == null) return 0;
  const x = (rank - 1) / (TOP_K - 1);
  const curved = Math.pow(1 - x, 1.35);
  return Math.max(0, Math.round(curved * 100));
}

export async function buildAnswerRank({ env, dateKey, answerWordId }) {
  const TOPK = Number(env.RANK_TOPK ?? 3000);
  const CAND_LIMIT = Number(env.RANK_CANDIDATE_LIMIT ?? 8000);

  // fetch definitions of answer
  const defs = await env.DB.prepare(`
    SELECT definition FROM answer_sense WHERE word_id = ?
  `).bind(answerWordId).all();
  if (!defs?.results?.length) {
    return { ok:false, message:"정답 정의 없음" };
  }

  // build MATCH query (OR tokens)
  const tokens = Array.from(new Set(defs.results
    .flatMap(r => (r.definition || "").split(/\s+/))
    .map(t => t.trim())
    .filter(t => t.length >= 1)
  )).slice(0, 20);

  if (!tokens.length) {
    return { ok:false, message:"MATCH 토큰 없음" };
  }

  const match = tokens.map(t => `"${t.replace(/"/g, '')}"`).join(" OR ");

  const rows = await env.DB.prepare(`
    SELECT word_id, bm25(answer_sense_fts) AS score
    FROM answer_sense_fts
    WHERE answer_sense_fts MATCH ?
    ORDER BY score
    LIMIT ?
  `).bind(match, CAND_LIMIT).all();

  if (!rows?.results?.length) {
    return { ok:false, message:"후보군 0건" };
  }

  // clear existing
  await env.DB.prepare(`DELETE FROM answer_rank WHERE date_key = ?`)
    .bind(dateKey).run();

  // insert topK
  const top = rows.results.slice(0, TOPK);
  let rank = 1;
  const batch = env.DB.batch();
  for (const r of top) {
    batch.add(
      env.DB.prepare(`
        INSERT INTO answer_rank(date_key, word_id, rank, score)
        VALUES(?,?,?,?)
      `).bind(dateKey, r.word_id, rank++, r.score)
    );
  }
  await batch.run();
  return { ok:true, count: top.length };
}
