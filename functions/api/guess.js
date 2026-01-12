import { json, seoulDateKey, getDailyAnswer, normalizeWord } from './_common.js';

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get('word');
    if (!raw) return json({ ok:false, message:'word 필요' }, 400);

    const word = normalizeWord(raw);
    const dateKey = seoulDateKey();

    const ans = await getDailyAnswer(env, dateKey);
    if (!ans?.id) return json({ ok:false, message:'정답 없음' }, 500);

    const row = await env.DB.prepare(`
      SELECT word_id, display_word
      FROM answer_pool
      WHERE display_word = ? OR match_key = ?
      LIMIT 1
    `).bind(word, word).first();

    if (!row?.word_id) {
      return json({ ok:true, data:{ word, percent:0, rank:null, isCorrect:false } });
    }

    const isCorrect = (row.word_id === ans.id);
    if (isCorrect) {
      // ✅ 정답은 랭킹에서 제외. 맞히면 100.00으로만 표시.
      return json({ ok:true, data:{ word: row.display_word ?? word, percent:100.00, rank:0, isCorrect:true } });
    }

    const ar = await env.DB.prepare(`
      SELECT rank, percent
      FROM answer_rank
      WHERE date_key = ? AND word_id = ?
    `).bind(dateKey, row.word_id).first();

    const rank = ar?.rank ?? null;
    const percent = (ar?.percent ?? 0);

    return json({ ok:true, data:{ word: row.display_word ?? word, percent, rank, isCorrect:false } });
  } catch (err) {
    return json({ ok:false, message:'guess 오류', detail:String(err?.message ?? err) }, 500);
  }
}
