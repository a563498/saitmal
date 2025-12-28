import { jsonResponse, pickDailyAnswer } from './_common.js';
export async function onRequestGet({ env }){
  const a = await pickDailyAnswer(env);
  if (!a.ok) return jsonResponse({ ok:false, message:a.message, detail:a.detail }, a.status||502);
  return jsonResponse({ ok:true, dateKey:a.dateKey, fixedDaily:true, env:{ hasKey:!!env.OPENDICT_KEY, hasKV:!!env.TTEUTGYOP_KV }});
}
