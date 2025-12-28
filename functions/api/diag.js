import { jsonResponse, opendictSearch, lookupWord, pickDailyAnswer } from './_common.js';

export async function onRequestGet({ request, env }){
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "사과";

  const search = await opendictSearch(env, q, { method:"exact", num:10, sort:"dict" });
  const lookup = await lookupWord(env, q);
  const answer = await pickDailyAnswer(env, null);

  return jsonResponse({
    ok:true,
    env: { hasKey: !!env.OPENDICT_KEY, hasKV: !!env.TTEUTGYOP_KV },
    q,
    search,
    lookup,
    answer
  });
}
