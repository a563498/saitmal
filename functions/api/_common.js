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

function xmlErrorMessage(xml){
  const code = xmlFirst(xml, "error_code") || xmlFirst(xml, "code") || "";
  const msg = xmlFirst(xml, "message") || xmlFirst(xml, "msg") || xmlFirst(xml, "error_message") || "";
  const err = xmlFirst(xml, "error") || "";
  const combined = [code, err, msg].filter(Boolean).join(" ").trim();
  if (combined && !xml.includes("<item>") && !xml.includes("<channel>")) return combined;
  return "";
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

  const norm = wordExact ? normalizeWord(wordExact) : null;
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

  const norm = wordExact ? normalizeWord(wordExact) : null;

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

    return { word: stripCaret(word), pos, definition, target_code, type, cat };
  };

  if (norm){
    for (const it of arr){
      const n = normItem(it);
      if (normalizeWord(n.word) === norm) return n;
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

  // KV 캐시(단어 뜻풀이 캐시) - 속도 개선
  if (env.TTEUTGYOP_KV){
    try{
      const cached = await env.TTEUTGYOP_KV.get(`w:${w}`, { type:"json" });
      if (cached && cached.word && cached.definition){
        return {ok:true,data:cached, cached:true};
      }
    }catch(e){}
  }

  const s = await opendictSearch(env, w, {method:"exact", num:50, sort:"dict"});
  if (!s.ok) return s;

  const base = pickEntryFromSearch(s.data, w);
  if (!base || !base.word) return {ok:false,status:404,message:`"${w}" 검색 결과 없음`};

  const out = {
    word: stripCaret(base.word),
    pos: base.pos || "",
    definition: base.definition || "",
    target_code: base.target_code ?? null,
    type: base.type || "",
    cat: base.cat || ""
  };

  // definition/pos가 비어 있으면 view API로 보강
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

  // KV에 저장(7일)
  if (env.TTEUTGYOP_KV){
    try{
      await env.TTEUTGYOP_KV.put(`w:${w}`, JSON.stringify(out), { expirationTtl: 60*60*24*7 });
    }catch(e){}
  }

  return {ok:true,data:out};
}

async function pickDailyAnswer(env, gameId=null){
  const dateKey = seoulDateKey();
  const cacheKey = `ans:${dateKey}`; // 하루 1개 정답 고정(새 게임 눌러도 변하지 않음)

  if (env.TTEUTGYOP_KV){
    try{
      const cached = await env.TTEUTGYOP_KV.get(cacheKey, { type:"json" });
      if (cached && cached.word && cached.definition) return {ok:true,data:cached};
    }catch(e){}
  }

  const seedBase = `date:${dateKey}`;
  let h = fnv1a32(seedBase);

  const syllables = ["가","나","다","라","마","바","사","아","자","차","카","타","파","하"];

  const isHard = (w, def) => {
    if (!w || !def) return true;
    if (w.length < 2 || w.length > 5) return true;
    if (/[^가-힣]/.test(w)) return true;
    const hardHints = ["방언", "옛말", "북한", "속담", "옛이름", "옛글", "은어"];
    if (hardHints.some(k=>def.includes(k))) return true;
    return false;
  };

  for (let attempt=0; attempt<12; attempt++){
    const q = syllables[h % syllables.length];
    const startNo = 1 + ((h >>> 8) % 800);

    const s = await opendictSearch(env, q, { method:"include", start: startNo, num: 10, sort:"dict" });
    if (!s.ok){
      h = fnv1a32(`${seedBase}:${attempt+1}`);
      continue;
    }

    const items = s.data?.channel?.item;
    const arr = Array.isArray(items) ? items : (items ? [items] : []);
    if (!arr.length){
      h = fnv1a32(`${seedBase}:${attempt+1}`);
      continue;
    }

    const offset = (h >>> 16) % arr.length;
    const limit = Math.min(10, arr.length);

    for (let k=0; k<limit; k++){
      const picked = arr[(offset + k) % arr.length];
      const cand = stripCaret(picked.word);
      if (!cand) continue;

      const lw = await lookupWord(env, cand);
      if (!lw.ok) continue;

      const ans = {
        word: lw.data.word,
        pos: lw.data.pos || "",
        definition: lw.data.definition || "",
        target_code: lw.data.target_code ?? null,
        type: lw.data.type || "",
        cat: lw.data.cat || ""
      };

      if (isHard(ans.word, ans.definition)) continue;

      if (env.TTEUTGYOP_KV){
        try{ await env.TTEUTGYOP_KV.put(cacheKey, JSON.stringify(ans), { expirationTtl: 60*60*48 }); }catch(e){}
      }
      return {ok:true,data:ans};
    }

    h = fnv1a32(`${seedBase}:${attempt+1}`);
  }

  return {ok:false,status:502,message:"정답 뜻풀이를 가져오지 못했어요.",detail:"정답 후보 필터링(길이/방언 등) 이후 남는 단어가 없었습니다. 필터 조건을 완화해야 합니다."};
}

function wordNgrams(w){
  const s = normalizeWord(w);
  const out = new Set();
  if (!s) return out;
  out.add(s);
  for (let i=0;i<s.length-1;i++) out.add(s.slice(i,i+2));
  if (s.length>=3){
    out.add(s.slice(0,3));
    out.add(s.slice(s.length-3));
  }
  if (s.length>=2){
    out.add(s.slice(0,2));
    out.add(s.slice(s.length-2));
  }
  return out;
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

export { jsonResponse, normalizeWord, tokenize, choseong, seoulDateKey, lookupWord, pickDailyAnswer, computeSimilarity, opendictSearch };
