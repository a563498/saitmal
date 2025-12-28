import { jsonResponse, pickDailyAnswer, choseong } from './_common.js';
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const level = Number(url.searchParams.get("level") || "1");
  const game = url.searchParams.get("game");

  const a = await pickDailyAnswer(env, game);
  if (!a.ok) return jsonResponse({ ok:false, message: a.message, detail: a.detail }, a.status || 500);

  const ans = a.data;
  const hints = [];
  if (level >= 1){
    hints.push(`품사: ${ans.pos || "—"}`);
    hints.push(`글자수: ${ans.word.length}`);
  }
  if (level >= 2){
    hints.push(`초성: ${choseong(ans.word)}`);
    if (ans.type) hints.push(`범주: ${ans.type}`);
    if (ans.cat) hints.push(`분야: ${ans.cat}`);
  }
  return jsonResponse({ ok:true, hints });
}
