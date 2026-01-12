import { json, seoulDateKey, getDailyAnswer } from './_common.js';
import { buildAnswerRank, percentFromRank } from '../lib/rank.js';

export async function onRequestGet(context){
  const { env, request, waitUntil } = context;
  try{
    if (!env.DB) {
      return json({ ok:false, message:"D1 바인딩(DB)이 없어요. Pages > Settings > Bindings에서 D1을 연결하세요." }, 500);
    }

    const url = new URL(request.url);
    const reqLimit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "10")));
    const wantsBuild = (url.searchParams.get("build") === "1") || (url.searchParams.get("debug") === "1");

    const dateKey = seoulDateKey();
    const ans = await getDailyAnswer(env, dateKey);
    if (!ans?.id) {
      return json({ ok:false, message:"정답 생성 실패(DB에 단어가 없어요). DB 업로드를 확인하세요." }, 500);
    }

    let build = null;

    if (wantsBuild){
      build = await buildAnswerRank({ env, dateKey, answerWordId: ans.id });
    } else {
      // 랭킹이 없으면(첫 방문) 백그라운드로 생성 시도 (가능한 환경에서만)
      try{
        if (typeof waitUntil === 'function') {
          waitUntil(buildAnswerRank({ env, dateKey, answerWordId: ans.id }));
        }
      } catch {}
    }

    // ✅ 운영 안정화: answer_rank 단독 조회 (JOIN 금지)
    const rows = await env.DB.prepare(`
      SELECT rank, display_word, pos
      FROM answer_rank
      WHERE date_key = ?
      ORDER BY rank
      LIMIT ?
    `).bind(dateKey, reqLimit).all();

    const TOPK = Number(env.RANK_TOPK ?? 3000);
    const items = (rows?.results ?? []).map(r => ({
      word: r.display_word,
      rank: r.rank,
      percent: percentFromRank(r.rank, TOPK),
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
