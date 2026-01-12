import { json, seoulDateKey, getDailyAnswer } from './_common.js';
import { buildAnswerRank } from '../lib/rank.js';

export async function onRequestGet(context){
  const { env, request, waitUntil } = context;
  try{
    if (!env.DB) return json({ ok:false, message:"D1 바인딩(DB)이 없어요." }, 500);

    const url = new URL(request.url);
    const reqLimit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "10")));
    const wantsBuild = (url.searchParams.get("build") === "1") || (url.searchParams.get("debug") === "1");

    const dateKey = seoulDateKey();
    const ans = await getDailyAnswer(env, dateKey);
    if (!ans?.id) return json({ ok:false, message:"정답 생성 실패" }, 500);

    let build = null;
    if (wantsBuild){
      build = await buildAnswerRank({ env, dateKey, answerWordId: ans.id, answerPos: ans.pos || null });
    } else {
      try{
        if (typeof waitUntil === 'function') {
          waitUntil(buildAnswerRank({ env, dateKey, answerWordId: ans.id, answerPos: ans.pos || null }));
        }
      } catch {}
    }

    const rows = await env.DB.prepare(`
      SELECT rank, display_word, pos, percent
      FROM answer_rank
      WHERE date_key = ?
      ORDER BY rank
      LIMIT ?
    `).bind(dateKey, reqLimit).all();

    const items = (rows?.results ?? []).map(r => ({
      word: r.display_word,
      rank: r.rank,
      percent: r.percent ?? null,
      pos: r.pos ?? null,
    }));

    const payload = {
      ok: true,
      dateKey,
      answer: ans ? { word: ans.word, pos: ans.pos || null, level: ans.level || null } : null,
      items,
    };
    if (build) payload.build = build;

    return json(payload);
  } catch(e) {
    return json({ ok:false, message:"top 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
