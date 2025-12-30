import { json, seoulDateKey, pickDailyAnswer, d1GetByWord, similarityScore } from './_common.js';

export async function onRequestGet({ request, env }){
  try{
    if (!env.DB) return json({ ok:false, message:"D1 바인딩(DB)이 없어요." }, 500);

    const url = new URL(request.url);
    const w = url.searchParams.get("word") || "";
    if (!w.trim()) return json({ ok:false, message:"단어를 입력하세요." }, 400);

    const dateKey = seoulDateKey();
    const ans = await pickDailyAnswer(env.DB, dateKey);
    if (!ans) return json({ ok:false, message:"정답 생성 실패" }, 500);

    const g = await d1GetByWord(env.DB, w);
    if (!g) return json({ ok:false, message:"사전에 없는 단어예요." }, 404);

    const sim = similarityScore(g, ans);
    const percent = Math.max(1, Math.min(100, Math.round(sim*100)));

    const isCorrect = (g.word === ans.word);

    // 단서(구체화)
    const deltaLen = g.word.length - ans.word.length;
    const lenHint = deltaLen === 0 ? "같음" : (deltaLen > 0 ? `입력(${g.word.length})이 더 김` : `입력(${g.word.length})이 더 짧음`);

    const posHint = (g.pos && ans.pos && g.pos === ans.pos) ? "같음" : "다름/불명";
    const levelHint = (g.level && ans.level && g.level === ans.level) ? "같음" : "다름/불명";

    return json({
      ok:true,
      data:{
        word:g.word,
        percent,
        isCorrect,
        clues:{
          글자수: { answer: ans.word.length, input: g.word.length, delta: deltaLen, text: lenHint },
          품사: { answer: ans.pos||null, input: g.pos||null, text: posHint },
          난이도: { answer: ans.level||null, input: g.level||null, text: levelHint }
        }
      }
    });
  }catch(e){
    return json({ ok:false, message:"guess 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
