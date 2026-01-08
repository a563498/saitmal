
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

  // 1) 정답의 정의(뜻) 가져오기
  const defs = await env.DB.prepare(`
    SELECT definition FROM answer_sense WHERE word_id = ?
  `).bind(answerWordId).all();

  if (!defs?.results?.length) {
    return { ok: false, message: "정답 정의 없음" };
  }

  // 2) MATCH 쿼리 토큰 만들기(최대 20개)
  const tokens = Array.from(new Set(
    defs.results
      .flatMap(r => (r.definition || "").split(/\s+/))
      .map(t => t.trim())
      .filter(t => t.length >= 1)
  )).slice(0, 20);

  if (!tokens.length) {
    return { ok: false, message: "MATCH 토큰 없음" };
  }

  // FTS5 MATCH 문자열: "토큰1" OR "토큰2" ...
  const match = tokens.map(t => `"${t.replace(/"/g, "")}"`).join(" OR ");

  // 3) FTS로 후보군 추출
  const rows = await env.DB.prepare(`
    SELECT word_id, bm25(answer_sense_fts) AS score
    FROM answer_sense_fts
    WHERE answer_sense_fts MATCH ?
    ORDER BY score
    LIMIT ?
  `).bind(match, CAND_LIMIT).all();

  if (!rows?.results?.length) {
    return { ok: false, message: "후보군 추출 실패(0건)" };
  }

  // 4) 기존 랭킹 삭제
  await env.DB.prepare(`DELETE FROM answer_rank WHERE date_key = ?`)
    .bind(dateKey).run();

  // 5) TopK insert (D1 batch는 배열 형태로만 지원)
  const top = rows.results.slice(0, TOPK);
  const statements = [];
  let rank = 1;

  for (const r of top) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO answer_rank(date_key, word_id, rank, score)
        VALUES(?,?,?,?)
      `).bind(dateKey, r.word_id, rank++, r.score)
    );
  }

  // 너무 큰 batch를 피하기 위해 100개씩 나눠 실행
  for (const chunk of chunkArray(statements, 100)) {
    await env.DB.batch(chunk);
  }

  return { ok: true, count: top.length };
}
