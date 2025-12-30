import { json, seoulDateKey, getDailyAnswer, similarityScore, scoreToPercent, resolveKV, normalizeWord } from './_common.js';

async function tableColumns(DB, table){
  try{
    const { results } = await DB.prepare(`PRAGMA table_info(${table});`).all();
    return new Set((results||[]).map(r=>String(r.name||"").toLowerCase()));
  }catch{
    return new Set();
  }
}

function pickCol(cols, names, fallback=null){
  for (const n of names){
    if (cols.has(String(n).toLowerCase())) return n;
  }
  return fallback;
}

async function hasTable(DB, name){
  try{
    const r = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
    return !!(r && r.name);
  }catch{
    return false;
  }
}

export async function onRequestGet({ env, request }){
  try{
    if (!env.DB) return json({ ok:false, message:"D1 바인딩(DB)이 없어요." }, 500);

    const url = new URL(request.url);
    const reqLimit = Math.max(1, Math.min(10, parseInt(url.searchParams.get('limit')||'10',10))); // UI는 TOP10
    const dateKey = seoulDateKey();

    const kv = resolveKV(env);
    const cacheKey = `saitmal:top10:${dateKey}`;
    if (kv){
      const cached = await kv.get(cacheKey);
      if (cached){
        try{
          const items = JSON.parse(cached);
          return json({ ok:true, dateKey, items: items.slice(0, reqLimit) });
        }catch{/* ignore */}
      }
    }

    const ans = await getDailyAnswer(env, dateKey);
    if (!ans) return json({ ok:false, message:"정답 생성 실패" }, 500);

    // ---- schema detect ----
    const eCols = await tableColumns(env.DB, "entries");
    const sCols = await tableColumns(env.DB, "senses");

    const eId = pickCol(eCols, ["id","entry_id","entryid","eid"], "id");
    const eWord = pickCol(eCols, ["word","lemma","headword","entry"], "word");
    const ePos = pickCol(eCols, ["pos","part_of_speech","pos_name","posnm"], null);
    const eLevel = pickCol(eCols, ["level","difficulty","lvl"], null);

    // Optional: entries에 정의/예문이 있으면 그대로 사용
    const eDef = pickCol(eCols, ["definition","def","mean","meaning","definition_text"], null);
    const eEx  = pickCol(eCols, ["example","ex","sample","usage","example_text"], null);

    // senses에서 정의/예문 찾기
    const sFk   = pickCol(sCols, ["entry_id","entryid","eid","entry","entries_id"], null);
    const sDef  = pickCol(sCols, ["definition","def","mean","meaning","sense_definition","definition_text"], null);
    const sEx   = pickCol(sCols, ["example","ex","sample","usage","example_text"], null);
    const sOrd  = pickCol(sCols, ["sense_order","ord","order","seq","no","idx"], null);

    // ---- candidate query ----
    const where = [];
    const args = [];

    // candidates 규모 (성능/정확도 트레이드오프)
    const SAMPLE = 5000;

    // FTS가 있으면 후보를 더 똑똑하게 줄인다
    const hasFTS = await hasTable(env.DB, "entries_fts");

    let sql = "";
    if (hasFTS){
      // 정답 표제어 기반으로 FTS 후보 확보 (정확도/속도 균형)
      const q = normalizeWord(ans.word||"").replace(/\s+/g," ").trim();
      const ftsLimit = 2500;
      sql = `
        SELECT e.${eId} AS id,
               e.${eWord} AS word
               ${ePos ? `, e.${ePos} AS pos` : ", NULL AS pos"}
               ${eLevel ? `, e.${eLevel} AS level` : ", NULL AS level"}
               ${eDef ? `, e.${eDef} AS definition` : ", NULL AS definition"}
               ${eEx  ? `, e.${eEx} AS example` : ", NULL AS example"}
        FROM entries e
        JOIN entries_fts f ON f.rowid = e.${eId}
        WHERE f.word MATCH ?
        LIMIT ${ftsLimit}
      `;
      args.push(q || ans.word);
    } else {
      sql = `
        SELECT e.${eId} AS id,
               e.${eWord} AS word
               ${ePos ? `, e.${ePos} AS pos` : ", NULL AS pos"}
               ${eLevel ? `, e.${eLevel} AS level` : ", NULL AS level"}
               ${eDef ? `, e.${eDef} AS definition` : ", NULL AS definition"}
               ${eEx  ? `, e.${eEx} AS example` : ", NULL AS example"}
        FROM entries e
        ORDER BY RANDOM()
        LIMIT ${SAMPLE}
      `;
    }

    let rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];

    // senses에서 정의/예문이 필요한 경우: 첫 sense를 JOIN해서 한번에 보강
    const needSense = (!eDef && sFk && sDef) || (!eEx && sFk && sEx);
    if (needSense && rows.length){
      const ids = rows.map(r=>r.id).filter(Boolean);
      // IN 절이 너무 길어지지 않게 제한
      const chunk = ids.slice(0, 1500);
      const placeholders = chunk.map(()=>"?").join(",");
      const orderBy = sOrd ? `ORDER BY s.${sOrd} ASC, s.rowid ASC` : `ORDER BY s.rowid ASC`;
      // entry당 1개 sense(가장 앞)만 가져오기 (rowid 서브쿼리)
      const senseSql = `
        SELECT s.${sFk} AS entry_id,
               ${sDef ? `s.${sDef} AS definition` : "NULL AS definition"}
               ${sEx  ? `, s.${sEx} AS example` : ", NULL AS example"}
        FROM senses s
        WHERE s.rowid IN (
          SELECT s2.rowid
          FROM senses s2
          WHERE s2.${sFk} IN (${placeholders})
          GROUP BY s2.${sFk}
        )
      `;
      const senseRows = (await env.DB.prepare(senseSql).bind(...chunk).all()).results || [];
      const byId = new Map();
      for (const r of senseRows){
        byId.set(r.entry_id, { definition: r.definition||"", example: r.example||"" });
      }
      rows = rows.map(r=>{
        const s = byId.get(r.id);
        if (s){
          if (!r.definition) r.definition = s.definition;
          if (!r.example) r.example = s.example;
        }
        return r;
      });
    }

    // ---- scoring ----
    const items = [];
    for (const r of rows){
      const w = r.word;
      if (!w || w === ans.word) continue;

      const guess = {
        word: w,
        pos: r.pos || "",
        level: r.level || "",
        definition: r.definition || "",
        example: r.example || "",
      };

      const score = similarityScore(guess, ans);
      const percent = scoreToPercent(score, { isCorrect:false });
      items.push({ word: w, percent });
    }

    items.sort((a,b)=> (b.percent-a.percent) || a.word.localeCompare(b.word, "ko"));
    const topAll = items.slice(0, 10);

    if (kv) await kv.put(cacheKey, JSON.stringify(topAll), { expirationTtl: 60 * 60 * 24 * 2 });

    return json({ ok:true, dateKey, items: topAll.slice(0, reqLimit) });
  }catch(e){
    return json({ ok:false, message:"top 오류", detail:String(e && e.stack ? e.stack : e) }, 500);
  }
}
