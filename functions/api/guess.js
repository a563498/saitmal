import { percentFromRank } from '../lib/rank.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const word = url.searchParams.get('word');
    if (!word) return json({ ok: false, message: 'word 필요' }, 400);

    const dateKey = new Date().toISOString().slice(0, 10);

    const row = await env.DB.prepare(`
      SELECT word_id, display_word
      FROM answer_pool
      WHERE display_word = ? OR match_key = ?
      LIMIT 1
    `).bind(word, word).first();

    if (!row?.word_id) {
      return json({ ok: true, data: { word, percent: 0, rank: null, isCorrect: false } });
    }

    const ar = await env.DB.prepare(`
      SELECT rank
      FROM answer_rank
      WHERE date_key = ? AND word_id = ?
    `).bind(dateKey, row.word_id).first();

    const rank = ar?.rank ?? null;
    const percent = percentFromRank(rank, Number(env.RANK_TOPK ?? 3000));

    return json({
      ok: true,
      data: { word: row.display_word ?? word, percent, rank, isCorrect: false },
    });
  } catch (err) {
    return json({ ok: false, message: 'guess 오류', detail: String(err?.message ?? err) }, 500);
  }
}
