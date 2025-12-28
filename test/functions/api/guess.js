import { normalizeWord, tokenize, weightedJaccard, commonKeywords, lookupWord, pickDailyAnswer, seoulDateKey, jsonResponse } from './_common.js';
export async function onRequestGet({ request, env }) {
  try{
    const url = new URL(request.url);
    const word = normalizeWord(url.searchParams.get("word") || "");
    const game = url.searchParams.get("game");
    if (!word) return jsonResponse({ ok:false, message:"단어가 비었어요." }, 400);

    const [guess, answer] = await Promise.all([
      lookupWord(env, word),
      pickDailyAnswer(env, game)
    ]);

    if (!guess || !guess.definition){
      return jsonResponse({ ok:false, message:`"${word}" 는 우리말샘에서 찾을 수 없어요.` }, 404);
    }

    const aTok = new Set(tokenize(guess.definition + " " + (guess.cat||"") + " " + (guess.type||"")));
    const bTok = new Set(tokenize(answer.definition + " " + (answer.cat||"") + " " + (answer.type||"")));

    const sim = weightedJaccard(aTok, bTok) * 100;
    const common = commonKeywords(aTok, bTok, 10);
    const correct = guess.word === answer.word;

    return jsonResponse({
      ok:true,
      dateKey: game ? null : seoulDateKey(),
      word: guess.word,
      pos: guess.pos || "",
      score: sim,
      common,
      posMatch: (guess.pos || "") === (answer.pos || ""),
      lenDiff: Math.abs((guess.word||"").length - (answer.word||"").length),
      correct,
      ...(correct ? { answerWord: answer.word, answerDef: answer.definition } : {})
    });
  }catch(e){
    return jsonResponse({ ok:false, message: String(e?.message || e) }, 500);
  }
}
