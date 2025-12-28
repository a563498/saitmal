import { jsonResponse, pickDailyAnswer } from './_common.js';

export async function onRequestGet({ env }){
  try{
    const a = await pickDailyAnswer(env);
    if (!a.ok) return jsonResponse({ ok:false, message:a.message, detail:a.detail, env:{ hasKey:!!env.OPENDICT_KEY, hasKV:!!env.TTEUTGYOP_KV } }, a.status||502);
    return jsonResponse({ ok:true, dateKey:a.dateKey, fixedDaily:true, env:{ hasKey:!!env.OPENDICT_KEY, hasKV:!!env.TTEUTGYOP_KV }});
  }catch(e){
    return jsonResponse({ ok:false, message:"서버 오류(meta)", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
