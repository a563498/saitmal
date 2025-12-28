import { jsonResponse, seoulDateKey, pickDailyAnswer } from './_common.js';
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const game = url.searchParams.get("game");
  const ans = await pickDailyAnswer(env, game);
  if (!ans.ok) return jsonResponse({ ok:false, message: ans.message, detail: ans.detail }, ans.status || 500);
  return jsonResponse({ ok:true, dateKey: game ? null : seoulDateKey() });
}
