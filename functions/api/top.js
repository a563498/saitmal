import { json, seoulDateKey, getDailyAnswer, similarityScore, scoreToPercent, resolveKV } from './_common.js';

async function tableColumns(DB, table){
  const { results } = await DB.prepare(`PRAGMA table_info(${table});`).all();
  return new Set((results||[]).map(r=>String(r.name||"").toLowerCase()));
}

export async function onRequestGet({ env, request }){
  try{
    if (!env.DB) return json({ ok:false, message:"D1 바인딩(DB)이 없어요." }, 500);

    const url = new URL(request.url);
    const reqLimit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit')||'10',10)));
    const dateKey = seoulDateKey();
    const ans = await getDailyAnswer(env, dateKey);
    if (!ans) return json({ ok:false, message:"정답 생성 실패" }, 500);

    const kv = resolveKV(env);
    const cacheKey = `top10:${dateKey}`;
    if (kv){
      const cached = await kv.get(cacheKey);
      if (cached){
        return json({ ok:true, dateKey, answer:{ word: ans.word, pos: ans.pos||null, level: ans.level||null }, items: JSON.parse(cached) });
      }
    }

    // Build top10 (best-effort).
    // 1) tokens/rel_tokens 컬럼이 있으면 전체 스캔(상대적으로 빠름)
    // 2) 없으면 FTS(있으면)로 후보군을 줄여서 계산
    const cols = await tableColumns(env.DB, "entries");

    const limitPos = ans.pos || null;
    const limitLevel = ans.level || null;

    const where = [];
    const args = [];
    if (limitPos && cols.has("pos")) { where.push("pos = ?"); args.push(limitPos); }
    if (limitLevel && cols.has("level")) { where.push("level = ?"); args.push(limitLevel); }

    let results = [];

    if (cols.has("tokens") && cols.has("rel_tokens")){
      const sql = `SELECT word, pos, level, tokens, rel_tokens FROM entries ${where.length?("WHERE "+where.join(" AND ")):""}`;
      results = (await env.DB.prepare(sql).bind(...args).all()).results || [];
    } else {
      // Fallback: tokens가 없으면 entries_fts로 후보군을 줄여서 계산
      // (FTS가 없거나 비어있으면 임의 2500개 샘플로 제한)
      const hasFTS = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entries_fts'").first())?.name;
      if (hasFTS){
        // answer의 표제어/정의에서 대표 토큰을 추출해서 쿼리로 사용
        const q = String(ans.word||"").replace(/[^0-9a-z가-힣]+/g," ").trim();
        // FTS5 query: 안전하게 '정답 표제어'만 사용 (복잡한 문법은 오류/누락 위험)
        const ftsQuery = q || "";
        const ftsSql = `SELECT e.word AS word, e.pos AS pos, e.level AS level, e.definition AS definition, e.example AS example
                        FROM entries_fts f
                        JOIN entries e ON e.id = f.rowid
                        ${ftsQuery?"WHERE entries_fts MATCH ?":""}
                        LIMIT 2500`;
        const stmt = ftsQuery ? env.DB.prepare(ftsSql).bind(ftsQuery) : env.DB.prepare(ftsSql);
        results = (await stmt.all()).results || [];
      } else {
        const sql = `SELECT word, pos, level, definition, example FROM entries ${where.length?("WHERE "+where.join(" AND ")):""} LIMIT 2500`;
        results = (await env.DB.prepare(sql).bind(...args).all()).results || [];
      }
    }

    const items = [];
    for (const r of (results||[])){
      const w = r.word;
      if (!w || w === ans.word) continue;
      let tokens=[], rel=[];

      if (r.tokens){
        try{ tokens = JSON.parse(r.tokens||"[]"); }catch{ tokens=[]; }
      }
      if (r.rel_tokens){
        try{ rel = JSON.parse(r.rel_tokens||"[]"); }catch{ rel=[]; }
      }

      const score = similarityScore({ word:w, tokens, rel_tokens:rel, definition: r.definition, example: r.example }, ans);
      const percent = scoreToPercent(score, { isCorrect:false });

      items.push({ word: w, percent, pos: r.pos||null, level: r.level||null });
    }

    items.sort((a,b)=> (b.percent-a.percent) || (a.word.localeCompare(b.word)));
    const topAll = items.slice(0, 10);

    if (kv) await kv.put(cacheKey, JSON.stringify(topAll), { expirationTtl: 60 * 60 * 24 * 2 });

    return json({ ok:true, dateKey, answer:{ word: ans.word, pos: ans.pos||null, level: ans.level||null }, items: topAll.slice(0, reqLimit) });
  }catch(e){
    return json({ ok:false, message:"top 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
