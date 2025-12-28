import { jsonResponse, normalizeWord, choseong, lookupWord, pickDailyAnswer, computeSimilarity } from './_common.js';
export async function onRequestGet({ request, env }){
  const url = new URL(request.url);
  const raw = url.searchParams.get("word") || "";
  const q = normalizeWord(raw);
  if (!q) return jsonResponse({ ok:false, message:"단어를 입력해 주세요." }, 400);

  const a = await pickDailyAnswer(env);
  if (!a.ok) return jsonResponse({ ok:false, message:a.message, detail:a.detail }, a.status||502);

  const g = await lookupWord(env, q);
  if (!g.ok) return jsonResponse({ ok:false, message:g.message, detail:g.detail }, g.status||502);

  const answer = a.data;
  const guess = g.data;

  const similarity = computeSimilarity(guess, answer);
  const isCorrect = normalizeWord(guess.word) === normalizeWord(answer.word);

  const guessLen = normalizeWord(guess.word).length;
  const answerLen = normalizeWord(answer.word).length;
  const ac = choseong(answer.word);
  const gc = choseong(guess.word);
  let choseongMatchCount = 0;
  for (let i=0;i<Math.min(ac.length,gc.length);i++) if (ac[i]===gc[i]) choseongMatchCount++;

  const clues = {
    posMatch: (guess.pos||"") && (answer.pos||"") && (guess.pos === answer.pos),
    pos: guess.pos || "",
    answerPos: answer.pos || "",
    guessLen, answerLen,
    choseongMatchCount
  };

  return jsonResponse({ ok:true, data:{ word: guess.word, similarity, isCorrect, clues }});
}
