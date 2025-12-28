import { pickDailyAnswer, jsonResponse } from './_common.js';
export async function onRequestGet({ request, env }) {
  try{
    const url = new URL(request.url);
    const game = url.searchParams.get("game");
    const ans = await pickDailyAnswer(env, game);
    return jsonResponse({ ok:true, word: ans.word, pos: ans.pos || "", def: ans.definition || "" });
  }catch(e){
    return jsonResponse({ ok:false, message: String(e?.message || e) }, 500);
  }
}
