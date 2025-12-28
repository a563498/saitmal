import { pickDailyAnswer, seoulDateKey, jsonResponse } from './_common.js';
export async function onRequestGet({ request, env }) {
  try{
    const url = new URL(request.url);
    const game = url.searchParams.get("game");
    await pickDailyAnswer(env, game);
    return jsonResponse({ ok:true, dateKey: game ? null : seoulDateKey() });
  }catch(e){
    return jsonResponse({ ok:false, message: String(e?.message || e) }, 500);
  }
}
