const API_SEARCH = "https://opendict.korean.go.kr/api/search";
const API_VIEW   = "https://opendict.korean.go.kr/api/view";

const STOP = new Set([
  "그리고","또는","또","등","것","수","일","때","위해","같은","으로","로","에서","에게","을","를","은","는","이","가","과","와",
  "하다","되다","있다","없다","만들다","사용","사람","하는","부분","여러","정해","정한","대상","정도","보통",
  "어떤","같이","바탕","통해","비유","가능","필요","경우","기본","값","따라","및","또한"
]);

function jsonResponse(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }
  });
}
function normalizeWord(w){ return (w || "").trim().replace(/\s+/g, ""); }
function stripCaret(w){ return (w || "").replace(/\^/g, ""); }

function tokenize(text){
  const raw = (text || "")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  for (const t of raw){
    if (t.length <= 1) continue;
    if (STOP.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

function ngram3(word){
  const w = (word || "").trim();
  const grams = new Set();
  if (w.length < 3){ if (w) grams.add(w); return grams; }
  for (let i=0;i<=w.length-3;i++) grams.add(w.slice(i,i+3));
  return grams;
}
function jaccard(a,b){
  if (!a.size && !b.size) return 0;
  let inter=0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni===0?0:inter/uni;
}
function weightedJaccard(a, b){
  let inter=0, uni=0;
  const all = new Set([...a, ...b]);
  for (const tok of all){
    const w = Math.min(3, Math.max(1, Math.floor(tok.length/2)));
    const inA = a.has(tok), inB = b.has(tok);
    if (inA || inB) uni += w;
    if (inA && inB) inter += w;
  }
  return uni===0?0:inter/uni;
}
function commonKeywords(a,b,limit=12){
  const common=[];
  for (const tok of a) if (b.has(tok)) common.push(tok);
  common.sort((x,y)=>y.length-x.length);
  return common.slice(0,limit);
}
function choseong(word){
  const CHO=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  let out="";
  for (const ch of word){
    const code=ch.charCodeAt(0);
    if (code<0xAC00||code>0xD7A3){ out+=ch; continue; }
    const idx=Math.floor((code-0xAC00)/(21*28));
    out+=CHO[idx]||ch;
  }
  return out;
}
function seoulDateKey(){
  const now=new Date();
  const seoul=new Date(now.toLocaleString("en-US",{timeZone:"Asia/Seoul"}));
  const y=seoul.getFullYear();
  const m=String(seoul.getMonth()+1).padStart(2,"0");
  const d=String(seoul.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function fnv1a32(str){
  const enc=new TextEncoder().encode(str);
  let h=2166136261;
  for (const b of enc){ h^=b; h=Math.imul(h,16777619); }
  return h>>>0;
}

async function fetchTextSafe(url, headers={}){
  try{
    const res=await fetch(url,{headers, cf:{cacheTtl:3600,cacheEverything:true}});
    const text=await res.text();
    return {ok:res.ok,status:res.status,text:text??""};
  }catch(e){
    return {ok:false,status:0,text:String(e?.message||e)};
  }
}
async function fetchJsonSafe(url, headers={}){
  const r=await fetchTextSafe(url, headers);
  if (!r.ok) return {ok:false,status:r.status,text:r.text.slice(0,250)};
  try{ return {ok:true,status:r.status,json:JSON.parse(r.text)}; }
  catch{ return {ok:false,status:r.status,text:r.text.slice(0,250),note:"non-json"}; }
}
async function fetchXmlSafe(url, headers={}){
  const r=await fetchTextSafe(url, headers);
  if (!r.ok) return {ok:false,status:r.status,text:r.text.slice(0,250)};
  return {ok:true,status:r.status,xml:r.text||""};
}
function xmlGetAll(xml, tag){
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
  const out=[];
  let m;
  while ((m=re.exec(xml))){
    out.push(m[1].replace(/<!\\[CDATA\\[|\\]\\]>/g,"").trim());
  }
  return out;
}
function xmlFirst(xml, tag){
  const v = xmlGetAll(xml, tag);
  return v.length ? v[0] : "";
}
function xmlItems(xml){
  const re = /<item>([\s\S]*?)<\/item>/g;
  const out=[];
  let m;
  while ((m=re.exec(xml))) out.push(m[1]);
  return out;
}
function parseSearchXml(xml, wordExact=null){
  const items = xmlItems(xml);
  if (!items.length) return null;

  const norm = wordExact ? stripCaret(wordExact) : null;
  let chosen = items[0];

  if (norm){
    for (const it of items){
      const w = stripCaret(xmlFirst(it, "word"));
      if (w === norm){ chosen = it; break; }
    }
  }

  const word = stripCaret(xmlFirst(chosen, "word"));
  const pos = xmlFirst(chosen, "pos");
  const definition = xmlFirst(chosen, "definition") || xmlFirst(chosen, "def");
  const target_code = xmlFirst(chosen, "target_code") || xmlFirst(chosen, "targetCode");
  const type = xmlFirst(chosen, "type");
  const cat = xmlFirst(chosen, "cat");
  return {
    word,
    pos,
    definition,
    target_code: target_code ? Number(target_code) : null,
    type,
    cat
  };
}
function parseViewXml(xml){
  const items = xmlItems(xml);
  const chosen = items.length ? items[0] : xml;
  const word = stripCaret(xmlFirst(chosen, "word"));
  const pos = xmlFirst(chosen, "pos");
  const definition = xmlFirst(chosen, "definition") || xmlFirst(chosen, "definition_original") || xmlFirst(chosen, "def");
  return { word, pos, definition };
}
function pickEntryFromSearch(searchJson, wordExact=null){
  const items = searchJson?.channel?.item;
  if (!items) return null;
  const arr = Array.isArray(items) ? items : [items];

  const norm = wordExact ? stripCaret(wordExact) : null;

  const normItem = (it) => {
    const wi = it.word_info || it.wordInfo || it.wordinfo;
    const sense = it.sense_info || it.senseInfo || it.senseinfo || it.sense || it.senseInfoList || it.sense_info_list;

    const word =
      stripCaret(it.word || wi?.word || (wi?.wordinfo?.word) || (Array.isArray(wi)? wi[0]?.word : "") || "");

    const definition =
      it.definition ||
      it.def ||
      sense?.definition ||
      sense?.definition_original ||
      (Array.isArray(sense)? (sense[0]?.definition || sense[0]?.definition_original) : "") ||
      "";

    const pos =
      it.pos ||
      sense?.pos ||
      (Array.isArray(sense)? sense[0]?.pos : "") ||
      "";

    const target_code = it.target_code ?? it.targetCode ?? null;

    const type =
      it.type ||
      sense?.type ||
      (Array.isArray(sense)? sense[0]?.type : "") ||
      "";

    const cat =
      it.cat ||
      it.cat_info?.cat ||
      sense?.cat_info?.cat ||
      (Array.isArray(sense)? (sense[0]?.cat_info?.cat || sense[0]?.cat) : "") ||
      sense?.cat ||
      "";

    return { word, pos, definition, target_code, type, cat };
  };

  if (norm){
    for (const it of arr){
      const n = normItem(it);
      if (n.word === norm) return n;
    }
  }
  return normItem(arr[0]);
}

async function opendictSearch(env, q, opts={}){
  if (!env.OPENDICT_KEY){
    return {ok:false,status:400,message:"OPENDICT_KEY 환경변수가 없습니다. (Cloudflare Pages → Settings → Environment variables)"};
  }
  const p=new URLSearchParams({
    key:String(env.OPENDICT_KEY),
    q,
    req_type:"json",
    advanced:"n",
    part:"word",
    method:opts.method||"exact",
    start:String(opts.start||1),
    num:String(opts.num||30),
    sort:opts.sort||"dict"
  });

  const headers = { "accept":"application/json,*/*", "user-agent":"tteutgyeop/1.1 (+https://pages.dev)" };

  // 1) JSON 시도
  const r=await fetchJsonSafe(`${API_SEARCH}?${p.toString()}`, headers);
  if (r.ok) return {ok:true,data:r.json};

  // 2) JSON이 500/HTML 등으로 깨지는 경우 XML로 재시도
  const p2=new URLSearchParams(p);
  p2.set("req_type","xml");
  const x=await fetchXmlSafe(`${API_SEARCH}?${p2.toString()}`, { "accept":"application/xml,text/xml,*/*", "user-agent": headers["user-agent"] });
  if (!x.ok) return {ok:false,status:502,message:`Upstream error (${x.status||r.status||"network"})`,detail:(x.text||r.text)};

  const item = parseSearchXml(x.xml, q);
  if (!item) return {ok:false,status:502,message:"Upstream XML 파싱 실패(검색 결과 없음/형식 변경).",detail:x.xml.slice(0,250)};

  return {ok:true,data:{ channel:{ item:{ word:item.word, pos:item.pos, definition:item.definition, target_code:item.target_code, type:item.type, cat:item.cat } } }};
}
async function opendictViewByTarget(env, targetCode){
  if (!env.OPENDICT_KEY) return {ok:false,status:400,message:"OPENDICT_KEY 환경변수가 없습니다."};
  const p=new URLSearchParams({key:env.OPENDICT_KEY,method:"target_code",q:String(targetCode),req_type:"json"});
  const r=await fetchJsonSafe(`${API_VIEW}?${p.toString()}`);
  if (!r.ok) return {ok:false,status:502,message:`Upstream error (${r.status||"network"})`,detail:r.text};
  return {ok:true,data:r.json};
}

async function lookupWord(env, word){
  const w = normalizeWord(word);
  if (!w) return {ok:false,status:400,message:"단어가 비었어요."};

  const s = await opendictSearch(env, w, {method:"exact", num:50, sort:"dict"});
  if (!s.ok) return s;

  const base = pickEntryFromSearch(s.data, w);
  if (!base || !base.word) return {ok:false,status:404,message:`"${w}" 검색 결과 없음`};

  const out = {
    word: base.word,
    pos: base.pos || "",
    definition: base.definition || "",
    target_code: base.target_code ?? null,
    type: base.type || "",
    cat: base.cat || ""
  };

  if ((!out.definition || !out.pos) && out.target_code){
    const v = await opendictViewByTarget(env, out.target_code);
    if (v.ok){
      const item2 = v.data?.channel?.item || v.data?.item;
      const wi = item2?.word_info || item2?.wordInfo || item2?.wordinfo;
      const si = item2?.sense_info || item2?.senseInfo || item2?.senseinfo || item2?.senseInfoList || item2?.sense_info_list;

      const word2 = stripCaret(item2?.word || wi?.word || "");
      const pos2 = item2?.pos || si?.pos || (Array.isArray(si)? si[0]?.pos : "");
      const def2 = item2?.definition || si?.definition || si?.definition_original || (Array.isArray(si)? (si[0]?.definition || si[0]?.definition_original) : "");

      if (!out.word && word2) out.word = word2;
      if (!out.pos && pos2) out.pos = pos2;
      if (!out.definition && def2) out.definition = def2;
    }
  }

  if (!out.definition){
    return {ok:false,status:502,message:"뜻풀이를 가져오지 못했어요(사전 응답 형식 문제).", detail:"search/view 응답에 definition이 비어있음. (키/제한/응답 변경 가능)."};
  }
  return {ok:true,data:out};
}

async function pickDailyAnswer(env, gameId=null){
  const dateKey = seoulDateKey();
  const cacheKey = gameId ? `ans:${gameId}` : `ans:${dateKey}`;

  // 0) KV에 이미 오늘 정답이 있으면 그대로 사용 (모두 같은 정답)
  if (env.TTEUTGYOP_KV){
    try{
      const cached = await env.TTEUTGYOP_KV.get(cacheKey, { type: "json" });
      if (cached && cached.word && cached.definition){
        return { ok:true, data: cached };
      }
    }catch(e){
      // KV가 없거나 읽기 실패해도 게임은 계속(그냥 fallback)
    }
  }

  // 1) 아직 없으면 “한 번만” 생성
  const seed = gameId ? `game:${gameId}` : `date:${dateKey}`;
  const h = fnv1a32(seed);

  const syllables = ["가","나","다","라","마","바","사","아","자","차","카","타","파","하"];
  const q = syllables[h % syllables.length];
  const start = 1 + ((h >>> 8) % 800);

  const s = await opendictSearch(env, q, { method:"include", start, num:30, sort:"dict" });
  if (!s.ok) return s;

  const items = s.data?.channel?.item;
  const arr = Array.isArray(items) ? items : (items ? [items] : []);
  if (!arr.length) return { ok:false, status:502, message:"정답 후보를 찾지 못했어요." };

  const picked = arr[(h >>> 16) % arr.length];
  const ans = {
    word: stripCaret(picked.word),
    pos: picked.pos || "",
    definition: picked.definition || "",
    target_code: picked.target_code ?? null,
    type: picked.type || "",
    cat: picked.cat || picked.cat_info?.cat || ""
  };

  if ((!ans.definition || !ans.pos) && ans.target_code){
    const v = await opendictViewByTarget(env, ans.target_code);
    if (v.ok){
      const item2 = v.data?.channel?.item;
      const sense = item2?.senseinfo || item2?.senseInfo;
      if (!ans.definition && sense?.definition) ans.definition = sense.definition;
      if (!ans.pos && sense?.pos) ans.pos = sense.pos;
    }
  }

  if (!ans.definition) return { ok:false, status:502, message:"정답 뜻풀이를 가져오지 못했어요." };

  // 2) KV에 저장(오늘은 고정)
  if (env.TTEUTGYOP_KV){
    try{
      await env.TTEUTGYOP_KV.put(cacheKey, JSON.stringify(ans), { expirationTtl: 60*60*48 });
    }catch(e){}
  }

  return { ok:true, data: ans };
}

function computeSimilarity(guess, answer){
  const aTok=new Set(tokenize(`${guess.definition} ${guess.cat||""} ${guess.type||""}`));
  const bTok=new Set(tokenize(`${answer.definition} ${answer.cat||""} ${answer.type||""}`));

  const semantic=weightedJaccard(aTok,bTok);
  const common=commonKeywords(aTok,bTok,12);

  const charSim=jaccard(ngram3(guess.word), ngram3(answer.word));
  let raw=0.95*semantic + 0.05*charSim;

  const c=common.length;
  let cap=100;
  if (c<=0) cap=18;
  else if (c===1) cap=35;
  else if (c===2) cap=55;

  let score=raw*100;
  if (score>cap) score=cap;

  if ((guess.pos||"") && (answer.pos||"") && guess.pos!==answer.pos) score*=0.92;

  score=Math.max(1, Math.min(100, score));
  return {score, common};
}

export { jsonResponse, normalizeWord, tokenize, choseong, seoulDateKey, lookupWord, pickDailyAnswer, computeSimilarity };
