import { json, seoulDateKey, getDailyAnswer } from './_common.js';

export async function onRequestPost({ env }){
  try{
    if (!env.DB) return json({ ok:false, message:"DB 바인딩 없음" }, 500);

    const ans = await getDailyAnswer(env, seoulDateKey());
    if (!ans) return json({ ok:false, message:"정답 생성 실패" }, 500);

    return json({
      ok:true,
      answer:{
        word: ans.word,
        pos: ans.pos||null,
        level: ans.level||null,
        definition: ans.definition||null,
        example: ans.example||null
      }
    });
  }catch(e){
    return json({ ok:false, message:"giveup 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
