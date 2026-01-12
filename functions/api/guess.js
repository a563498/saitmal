import { json, seoulDateKey, getDailyAnswer, normalizeWord } from './_common.js';
import { percentFromRank } from '../lib/rank.js';

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get('word');
    if (!raw) return json({ ok:false, message:'word 필요' }, 400);

    const word = normalizeWord(raw);
    const dateKey = seoulDateKey();

    const ans = await getDailyAnswer(env, dateKey);
    if (!ans?.id) return json({ ok:false, message:'정답 없음' }, 500);

    // ✅ 입력 단어는 answer_pool에서 찾아 word_id를 얻는다 (answer_rank.word_id와 매칭됨)
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

    const ar = await env.DB.prepare(`
      SELECT rank
      FROM answer_rank
      WHERE date_key = ? AND word_id = ?
    `).bind(dateKey, row.word_id).first();

    const rank = ar?.rank ?? null;
    const percent = percentFromRank(rank, Number(env.RANK_TOPK ?? 3000));

    return json({ ok:true, data:{ word: row.display_word ?? word, percent, rank, isCorrect } });
  } catch (err) {
    return json({ ok:false, message:'guess 오류', detail:String(err?.message ?? err) }, 500);
  }
}
