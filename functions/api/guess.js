import { json, seoulDateKey, getDailyAnswer, d1GetByWord, similarityScore, scoreToPercentScaled, getDbTop, normalizeWord } from './_common.js';

export async function onRequestGet({ request, env }){
  try{
    if (!env.DB) return json({ ok:false, message:"D1 바인딩(DB)이 없어요." }, 500);

    const url = new URL(request.url);
    const raw = url.searchParams.get("word") || "";
    const w = normalizeWord(raw);
    if (!w) return json({ ok:false, message:"단어를 입력하세요." }, 400);

    const dateKey = seoulDateKey();
    const ans = await getDailyAnswer(env, dateKey);
    if (!ans) return json({ ok:false, message:"정답 생성 실패" }, 500);

    const g = await d1GetByWord(env.DB, w);
    if (!g) return json({ ok:false, message:"사전에 없는 단어예요." }, 404);

    const isCorrect = g.word === ans.word;

    const score = similarityScore(g, ans);
    // DB에서 뽑은 최고 후보(raw score)를 기준으로 %를 상대 스케일링
    const top = await getDbTop(env, dateKey, { limit: 1 });
    const maxRaw = top?.maxRaw || 0;
    const percent = scoreToPercentScaled(score, maxRaw, { isCorrect });
    const rank = isCorrect ? 1 : (top?.map && top.map[g.word] ? (top.map[g.word].rank || null) : null);
    return json({ ok:true, data:{ word: g.word, percent, rank, isCorrect } });
  }catch(e){
    return json({ ok:false, message:"guess 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}