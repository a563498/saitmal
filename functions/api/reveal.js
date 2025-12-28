import { jsonResponse, pickDailyAnswer } from './_common.js';
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const game = url.searchParams.get("game");
  const a = await pickDailyAnswer(env, game);
  if (!a.ok) return jsonResponse({ ok:false, message: a.message, detail: a.detail }, a.status || 500);
  const ans = a.data;
  return jsonResponse({ ok:true, word: ans.word, pos: ans.pos || "", def: ans.definition || "" });
}
