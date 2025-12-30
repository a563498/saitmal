import { json, seoulDateKey, pickDailyAnswer } from './_common.js';

export async function onRequestGet({ env }){
  try{
    if (!env.DB) return json({ ok:false, message:"D1 바인딩(DB)이 없어요. Pages > Settings > Bindings에서 D1을 연결하세요." }, 500);
    const dateKey = seoulDateKey();
    const ans = await pickDailyAnswer(env.DB, dateKey);
    if (!ans) return json({ ok:false, message:"정답 생성 실패(DB에 단어가 없어요). DB 업로드를 확인하세요." }, 500);
    // 정답은 숨김
    return json({ ok:true, dateKey, answerLen: ans.word.length, answerPos: ans.pos||null, answerLevel: ans.level||null });
  }catch(e){
    return json({ ok:false, message:"meta 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
