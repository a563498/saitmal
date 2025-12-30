import { json, seoulDateKey, getDbTop } from './_common.js';

export async function onRequestGet({ env, request }){
  try{
    if (!env.DB) return json({ ok:false, message:"D1 바인딩(DB)이 없어요. Pages > Settings > Bindings에서 D1을 연결하세요." }, 500);
    const url = new URL(request.url);
    const reqLimit = Math.max(1, Math.min(10, Number(url.searchParams.get("limit") || "10")));
    const dateKey = seoulDateKey();

    const r = await getDbTop(env, dateKey, { limit: reqLimit });

    return json({
      ok: true,
      dateKey,
      items: r.items || [],
    });
  }catch(e){
    return json({ ok:false, message:"top 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
