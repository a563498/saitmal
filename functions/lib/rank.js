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

export async function buildAnswerRank({ env, dateKey, answerWordId }) {
  const TOPK = Number(env.RANK_TOPK ?? 3000);
  const CAND_LIMIT = Number(env.RANK_CANDIDATE_LIMIT ?? 8000);

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

  // bm25()는 집계 내부에서 직접 쓰지 말고, 서브쿼리에서 score로 만든 뒤 집계
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

  if (!rows?.results?.length) {
    return { ok: false, message: "후보군 추출 실패(0건)" };
  }

  await env.DB.prepare(`DELETE FROM answer_rank WHERE date_key = ?`)
    .bind(dateKey).run();

  const statements = [];
  const seen = new Set();
  let rank = 1;

  for (const r of rows.results) {
    if (!r?.word_id) continue;
    if (seen.has(r.word_id)) continue;
    seen.add(r.word_id);

    statements.push(
      env.DB.prepare(`
        INSERT INTO answer_rank(date_key, word_id, rank, score)
        VALUES(?,?,?,?)
      `).bind(dateKey, r.word_id, rank++, r.score)
    );

    if (rank > TOPK) break;
  }

  for (const chunk of chunkArray(statements, 100)) {
    await env.DB.batch(chunk);
  }

  return { ok: true, count: statements.length };
}
