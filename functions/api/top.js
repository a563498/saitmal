
import { buildAnswerRank } from '../lib/rank.js';

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? 10);
  const build = url.searchParams.get('build') === '1';
  const dateKey = new Date().toISOString().slice(0,10);

  if (build) {
    const ans = await env.DB.prepare(`
      SELECT word_id FROM answer_pool WHERE is_active=1 ORDER BY last_used_at IS NULL DESC LIMIT 1
    `).first();
    if (!ans) return new Response(JSON.stringify({ ok:false, message:"정답 없음" }), { status:500 });
    const res = await buildAnswerRank({ env, dateKey, answerWordId: ans.word_id });
    return new Response(JSON.stringify({ ok:true, build:res }), { headers:{'content-type':'application/json'} });
  }

  const rows = await env.DB.prepare(`
    SELECT ar.word_id, ar.rank, ar.score, le.display_word, le.pos
    FROM answer_rank ar
    JOIN lex_entry le ON le.entry_id = ar.word_id
    WHERE ar.date_key = ?
    ORDER BY ar.rank
    LIMIT ?
  `).bind(dateKey, limit).all();

  return new Response(JSON.stringify({
    ok:true,
    dateKey,
    items: rows.results ?? []
  }), { headers:{'content-type':'application/json'} });
}
