import { jsonResponse, normalizeWord, choseong, lookupWord, pickDailyAnswer, computeSimilarity } from './_common.js';

export async function onRequestGet({ request, env }){
  const url = new URL(request.url);
  const wordRaw = url.searchParams.get("word") || "";
  const word = normalizeWord(wordRaw);

  if (!word) return jsonResponse({ ok:false, message:"단어를 입력해 주세요." }, 400);

  const a = await pickDailyAnswer(env, null);
  if (!a.ok) return jsonResponse({ ok:false, message:a.message || "정답을 준비하지 못했어요.", detail:a.detail }, a.status||502);

  const g = await lookupWord(env, word);
  if (!g.ok) return jsonResponse({ ok:false, message:g.message || "사전 조회 실패", detail:g.detail }, g.status||502);

  const answer = a.data;
  const guess = g.data;

  let sim = computeSimilarity(guess, answer);
  let similarity = typeof sim === "number" ? sim : (sim?.score ?? 1);

  // 단서(직관적)
  const guessLen = normalizeWord(guess.word).length;
  const answerLen = normalizeWord(answer.word).length;

  const aC = choseong(answer.word);
  const gC = choseong(guess.word);
  let choseongMatchCount = 0;
  for (let i=0;i<Math.min(aC.length,gC.length);i++){
    if (aC[i] === gC[i]) choseongMatchCount++;
  }

  const clues = {
    posMatch: (guess.pos||"") && (answer.pos||"") && (guess.pos === answer.pos),
    pos: guess.pos || "",
    answerPos: answer.pos || "",
    guessLen, answerLen,
    lenDiff: (guessLen - answerLen),
    guessChoseong: gC,
    answerChoseong: aC,
    choseongMatchCount
  };

  const isCorrect = normalizeWord(guess.word) === normalizeWord(answer.word);

  return jsonResponse({
    ok:true,
    dateKey: url.searchParams.get("game") ? null : (new Date().toISOString()),
    data: {
      word: guess.word,
      similarity,
      isCorrect,
      clues
    }
  });
}
