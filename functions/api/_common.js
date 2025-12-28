// Core helpers for Cloudflare Pages Functions (OpenDict / 우리말샘)
const OPENDICT_BASE = "https://opendict.korean.go.kr/api/search";
const OPENDICT_VIEW = "https://opendict.korean.go.kr/api/view";

/** JSON response helper */
export function jsonResponse(obj, status=200, headers={}){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

/** Seoul date key: YYYY-MM-DD */
export function seoulDateKey(){
  const d = new Date();
  // force Asia/Seoul using UTC+9 math (no Intl dependency issues)
  const ms = d.getTime() + (9*60*60*1000);
  const k = new Date(ms).toISOString().slice(0,10);
  return k;
}


function getKV(env){
  // IMPORTANT: KV는 "Variables"가 아니라 "Bindings(KV namespace)"로 연결되어야 함
  const kv = env && (env.TTEUTGYOP_KV || env.TTEUTGYOOP_KV || env.TTEUTGYEOP_KV || env.TTEUTGYOPKV || env.KV);
  if (!kv) return { ok:false, message:"KV 바인딩(TTEUTGYOP_KV)이 없어요. Pages > Settings > Bindings에서 KV namespace를 추가하세요." };
  if (typeof kv.get !== "function" || typeof kv.put !== "function"){
    return { ok:false, message:"KV가 '바인딩'이 아니라 문자열로 들어왔어요. Variables and Secrets에 TTEUTGYOP_KV를 넣지 말고, Bindings에서 KV namespace로 연결해야 합니다." };
  }
  return { ok:true, kv };
}

function getOpenDictKey(env){
  const key = env && (env.OPENDICT_KEY || env.OPENDICTKEY || env.OPENDICT_API_KEY);
  if (!key) return { ok:false, message:"OPENDICT_KEY가 없어요. Pages > Settings > Variables and Secrets(Production)에 추가하세요." };
  return { ok:true, key:String(key).trim() };
}
// Normalize/clean headword
export function stripCaret(s){
  if (s==null) return "";
  return String(s)
    .replace(/\^/g,"")
    .replace(/[\u00B7\u318D\u2027·ㆍ]/g,"") // 가운데점류
    .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2212]/g,"") // 하이픈류
    .replace(/\s+/g,"")
    .trim();
}

export function normalizeWord(s){
  if (s==null) return "";
  return String(s)
    .normalize("NFKC")
    .replace(/[\u00B7\u318D\u2027·ㆍ]/g,"")
    .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2212]/g,"")
    .replace(/\s+/g,"")
    .replace(/[^가-힣]/g,"")
    .trim();
}

export function choseong(word){
  const w = String(word||"");
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  let out = "";
  for (const ch of w){
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3){
      const idx = Math.floor((code - 0xAC00) / 588);
      out += CHO[idx] || "";
    }else{
      out += ch;
    }
  }
  return out;
}

// lightweight tokenizer for similarity
const STOP = new Set(["것","수","등","및","또","에서","으로","하다","되다","있다","없다","이다","그","이","저","여러","어떤","때"]);
export function tokenize(text){
  const t = String(text||"").replace(/[^가-힣\s]/g," ").replace(/\s+/g," ").trim();
  if (!t) return [];
  return t.split(" ").filter(w=>w.length>=2 && !STOP.has(w));
}

// --- XML helpers (very small) ---
function tagValue(xml, tag){
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function decodeEntities(s){
  return String(s||"")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}

function firstItemBlock(xml){
  // get first <item>...</item>
  const m = xml.match(/<item>([\s\S]*?)<\/item>/i);
  return m ? m[1] : "";
}

function parseSearch(xml, exact){
  // if exact provided: find item whose <word> matches after normalize
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  if (!items.length) return null;

  const want = exact ? normalizeWord(exact) : null;

  function normItem(block){
    const word = stripCaret(decodeEntities(tagValue(block,"word")));
    const pos  = decodeEntities(tagValue(block,"pos"));
    const def  = decodeEntities(tagValue(block,"definition"));
    const tc   = decodeEntities(tagValue(block,"target_code")) || null;
    return { word, pos, definition:def, target_code: tc, type:"", cat:"" };
  }

  if (want){
    for (const b of items){
      const it = normItem(b);
      if (normalizeWord(it.word) === want) return it;
    }
    return null; // exact not found
  }
  return normItem(items[0]);
}

function parseView(xml){
  // view has <item><word>..</word><pos>..</pos><sense>...<definition>..</definition>...
  const item = firstItemBlock(xml);
  if (!item) return null;
  const word = stripCaret(decodeEntities(tagValue(item,"word")));
  const pos  = decodeEntities(tagValue(item,"pos"));
  // prefer first <definition> inside item
  const defm = item.match(/<definition>([\s\S]*?)<\/definition>/i);
  const definition = defm ? decodeEntities(defm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")).trim() : "";
  return { word, pos, definition, target_code:null, type:"", cat:"" };
}

async function fetchXml(url){
  try{
    const r = await fetch(url, { headers: { "user-agent": "tteutgyeop/1.0" }});
    const txt = await r.text();
    return { ok:r.ok, status:r.status, text:txt };
  }catch(e){
    return { ok:false, status:502, text:String(e && e.message ? e.message : e) };
  }
}

// Word lookup with KV cache (w:<word>) for 7 days
export async function lookupWord(env, word){
  const q = normalizeWord(word);
  if (!q) return { ok:false, status:400, message:"단어가 비어있어요." };

  const kvRes = getKV(env);
  const kv = kvRes.ok ? kvRes.kv : null;
  const cacheKey = `w:${q}`;

  if (kv){
    const cached = await kv.get(cacheKey, "json").catch(()=>null);
    if (cached && cached.word && cached.definition){
      return { ok:true, data: cached, cached:true };
    }
  }

  const keyRes = getOpenDictKey(env);
  if (!keyRes.ok){
    return { ok:false, status:500, message:keyRes.message };
  }

  // Search (simple) then we filter exact match in parseSearch
  const u = new URL(OPENDICT_BASE);
  u.searchParams.set("key", keyRes.key);
  u.searchParams.set("q", q);
  u.searchParams.set("req_type", "xml");
  u.searchParams.set("num", "20");
  const sres = await fetchXml(u.toString());
  if (!sres.ok){
    return { ok:false, status:sres.status, message:"사전 검색 실패", detail:sres.text?.slice(0,200) };
  }
  // detect OpenDict <error>
  if (/<error>/i.test(sres.text)){
    return { ok:false, status:502, message:"사전 오류 응답", detail:sres.text?.slice(0,200) };
  }

  let item = parseSearch(sres.text, q);
  if (!item || !item.word){
    return { ok:false, status:404, message:"검색 결과가 없어요." };
  }

  // If definition empty, try view using target_code if exists (search sometimes omits def)
  if (!item.definition && item.target_code){
    const v = new URL(OPENDICT_VIEW);
    v.searchParams.set("key", keyRes.key);
    v.searchParams.set("target_code", item.target_code);
    v.searchParams.set("req_type", "xml");
    const vres = await fetchXml(v.toString());
    if (vres.ok && !/<error>/i.test(vres.text)){
      const vitem = parseView(vres.text);
      if (vitem && vitem.definition) item.definition = vitem.definition;
      if (vitem && vitem.pos) item.pos = vitem.pos || item.pos;
    }
  }

  if (!item.definition){
    return { ok:false, status:502, message:"뜻풀이를 가져오지 못했어요(사전 응답 형식 문제).", detail:"definition empty" };
  }

  if (kv){
    await kv.put(cacheKey, JSON.stringify(item), { expirationTtl: 60*60*24*7 }).catch(()=>{});
  }
  return { ok:true, data:item, cached:false };
}

// Daily answer (ansv13:<dateKey>) – one per day for everyone
export async function pickDailyAnswer(env){
  const kvRes = getKV(env);
  if (!kvRes.ok) return { ok:false, status:500, message:kvRes.message };
  const kv = kvRes.kv;
  if (!kv) return { ok:false, status:500, message:"KV가 연결되지 않았어요(TTEUTGYOP_KV)." };

  const dateKey = seoulDateKey();
  const key = `ansv14:${dateKey}`;

  const cached = await kv.get(key, "json").catch(()=>null);
  if (cached && cached.word && cached.definition){
    return { ok:true, data: cached, dateKey };
  }

  // generate: pick from a small seed list then validate via lookupWord (fast enough once/day)
  const seeds = ["사과","사람","바다","도시","학교","친구","여행","음악","영화","책","하늘","별","시간","마음","가족","나라","거리","강","산","봄","비","눈","불","물","빛","길","꿈","말","손","눈물","웃음","밥","집","일","기술","데이터","자동차","휴대폰"];
  // pseudo-random by dateKey
  let h = 0;
  for (const c of dateKey) h = (h*31 + c.charCodeAt(0)) >>> 0;

  for (let i=0;i<seeds.length; i++){
    const idx = (h + i*13) % seeds.length;
    const w = seeds[idx];
    const lw = await lookupWord(env, w);
    if (lw.ok){
      await kv.put(key, JSON.stringify(lw.data), { expirationTtl: 60*60*48 }).catch(()=>{});
      return { ok:true, data: lw.data, dateKey };
    }
  }
  return { ok:false, status:502, message:"정답 생성 실패(사전 조회 실패 반복)" };
}

// Similarity: combine definition token overlap + substring boost
export function computeSimilarity(guess, answer){
  const gw = normalizeWord(guess?.word||"");
  const aw = normalizeWord(answer?.word||"");
  const gdef = guess?.definition || "";
  const adef = answer?.definition || "";

  const gt = new Set(tokenize(gdef));
  const at = new Set(tokenize(adef));

  let inter = 0;
  for (const t of gt) if (at.has(t)) inter++;

  const union = gt.size + at.size - inter;
  const jacc = union ? (inter / union) : 0;

  let boost = 0;
  if (gw && aw){
    if (gw === aw) boost = 1;
    else if (aw.includes(gw) || gw.includes(aw)) boost = 0.25;
    else{
      // n-gram overlap (2-gram)
      const grams = (w)=>{
        const a = [];
        for (let i=0;i<w.length-1;i++) a.push(w.slice(i,i+2));
        return a;
      };
      const gg = new Set(grams(gw));
      const ag = new Set(grams(aw));
      let gi=0;
      for (const t of gg) if (ag.has(t)) gi++;
      const gu = gg.size + ag.size - gi;
      boost = gu ? Math.min(0.18, gi/gu) : 0;
    }
  }

  let score = Math.round( (jacc*0.82 + boost*0.18) * 100 );
  // clamp & floor
  score = Math.max(1, Math.min(100, score));
  return score;
}
