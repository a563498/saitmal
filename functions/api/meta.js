import { json, seoulDateKey, getDailyAnswer } from './_common.js';
import { buildAnswerRank } from '../lib/rank.js';

export async function onRequestGet(context){
  const { env, waitUntil } = context;
  try{
    if (!env.DB) {
      return json({ ok:false, message:"D1 바인딩(DB)이 없어요. Pages > Settings > Bindings에서 D1을 연결하세요." }, 500);
    }

    const dateKey = seoulDateKey();
    const ans = await getDailyAnswer(env, dateKey);
    if (!ans?.id) {
      return json({ ok:false, message:"정답 생성 실패(DB에 단어가 없어요). DB 업로드를 확인하세요." }, 500);
    }

    // ✅ 랭킹 생성은 FTS 기반 buildAnswerRank로 통일 (응답은 막지 않음)
    try{
      if (typeof waitUntil === 'function') {
        waitUntil(buildAnswerRank({ env, dateKey, answerWordId: ans.id }));
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
