import { jsonResponse, lookupWord, pickDailyAnswer, computeSimilarity, seoulDateKey } from './_common.js';
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const word = url.searchParams.get("word") || "";
  const game = url.searchParams.get("game");

  const g = await lookupWord(env, word);
  if (!g.ok) return jsonResponse({ ok:false, message: g.message, detail: g.detail }, g.status || 500);

  const a = await pickDailyAnswer(env, game);
  if (!a.ok) return jsonResponse({ ok:false, message: a.message, detail: a.detail }, a.status || 500);

  const guess = g.data, answer = a.data;
  const noDef = !!guess.noDefinition;
  let { score, common } = computeSimilarity(guess, answer);
  if (noDef){ score = 1; common = []; }
  const correct = guess.word === answer.word;

  return jsonResponse({
    ok:true,
    dateKey: game ? null : seoulDateKey(),
    word: guess.word,
    pos: guess.pos || "",
    score,
    common,
    warning: noDef ? "이 단어의 뜻풀이를 가져오지 못해 점수는 낮게 표시됩니다(우리말샘 응답). 다른 단어로 시도해보세요." : undefined,
    posMatch: (guess.pos||"") === (answer.pos||""),
    lenDiff: Math.abs((guess.word||"").length - (answer.word||"").length),
    correct,
    ...(correct ? { answerWord: answer.word, answerDef: answer.definition } : {})
  });
}
