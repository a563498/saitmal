import { jsonResponse, lookupWord, getOpenDictKey } from './_common.js';

export async function onRequestGet({ request, env }){
  try{
    const url = new URL(request.url);
    const word = url.searchParams.get("word") || "사과";
    const keyRes = getOpenDictKey(env);
    const res = await lookupWord(env, word);
    return jsonResponse({ ok:true, input:word, hasKey:keyRes.ok, keyMessage:keyRes.message||null, lookup:res });
  }catch(e){
    return jsonResponse({ ok:false, message:"서버 오류(diag)", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
