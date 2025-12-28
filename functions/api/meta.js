import { jsonResponse, seoulDateKey, pickDailyAnswer, normalizeWord } from './_common.js';

export async function onRequestGet({ env }){
  const dateKey = seoulDateKey();
  const a = await pickDailyAnswer(env, null);
  if (!a.ok) return jsonResponse({ ok:false, message:a.message || "정답 뜻풀이를 가져오지 못했어요.", detail:a.detail }, a.status||502);

  return jsonResponse({
    ok:true,
    dateKey,
    fixedDaily:true,
    hasKey: !!env.OPENDICT_KEY,
    hasKV: !!env.TTEUTGYOP_KV,
    answerWordLen: normalizeWord(a.data.word).length
  });
}
