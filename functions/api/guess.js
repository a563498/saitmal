
import { percentFromRank } from '../lib/rank.js';

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const word = url.searchParams.get('word');
  if (!word) return new Response(JSON.stringify({ ok:false }), { status:400 });

  const dateKey = new Date().toISOString().slice(0,10);
  const le = await env.DB.prepare(`
    SELECT entry_id FROM lex_entry WHERE display_word = ? OR match_key = ? LIMIT 1
  `).bind(word, word).first();

  if (!le) {
    return new Response(JSON.stringify({ ok:true, data:{ word, percent:0, rank:null, isCorrect:false } }), { headers:{'content-type':'application/json'} });
  }

  const ar = await env.DB.prepare(`
    SELECT rank FROM answer_rank WHERE date_key = ? AND word_id = ?
  `).bind(dateKey, le.entry_id).first();

  const rank = ar?.rank ?? null;
  const percent = percentFromRank(rank, Number(env.RANK_TOPK ?? 3000));
  return new Response(JSON.stringify({
    ok:true,
    data:{ word, percent, rank, isCorrect:false }
  }), { headers:{'content-type':'application/json'} });
}
