import { json, seoulDateKey, getDailyAnswer } from './_common.js';
import { buildAnswerRank } from '../lib/rank.js';

export async function onRequestGet(context){
  const { env, waitUntil } = context;
  try{
    if (!env.DB) return json({ ok:false, message:"D1 바인딩(DB)이 없어요." }, 500);

    const dateKey = seoulDateKey();
    const ans = await getDailyAnswer(env, dateKey);
    if (!ans?.id) return json({ ok:false, message:"정답 생성 실패" }, 500);

    try{
      if (typeof waitUntil === 'function') {
        waitUntil(buildAnswerRank({ env, dateKey, answerWordId: ans.id, answerPos: ans.pos || null }));
      }
    } catch {}

    return json({
      ok: true,
      dateKey,
      answerLen: ans.word.length,
      answerPos: ans.pos || null,
      answerLevel: ans.level || null,
      bestDB: 0,
    });
  } catch(e) {
    return json({ ok:false, message:"meta 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
