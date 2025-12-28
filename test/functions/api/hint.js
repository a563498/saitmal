import { pickDailyAnswer, choseong, jsonResponse } from './_common.js';
export async function onRequestGet({ request, env }) {
  try{
    const url = new URL(request.url);
    const level = Number(url.searchParams.get("level") || "1");
    const game = url.searchParams.get("game");
    const ans = await pickDailyAnswer(env, game);

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
  }catch(e){
    return jsonResponse({ ok:false, message: String(e?.message || e) }, 500);
  }
}
