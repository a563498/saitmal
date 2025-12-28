import { normalizeWord, lookupWord, jsonResponse } from './_common.js';
export async function onRequestGet({ request, env }) {
  try{
    const url = new URL(request.url);
    const word = normalizeWord(url.searchParams.get("word") || "");
    if (!word) return jsonResponse({ ok:false, message:"단어가 비었어요." }, 400);

    const out = await lookupWord(env, word);
    if (!out) return jsonResponse({ ok:false, message:"검색 결과 없음" }, 404);

    return jsonResponse({ ok:true, ...out });
  }catch(e){
    return jsonResponse({ ok:false, message: String(e?.message || e) }, 500);
  }
}
