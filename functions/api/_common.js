
function jsonResponse(obj,status=200){
  return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json;charset=utf-8'}});
}
async function lookupWord(env,word){
  if(!env.OPENDICT_KEY) return {__error:'Missing OPENDICT_KEY'};
  return {word, pos:'명사', definition:'테스트'};
}
export {jsonResponse,lookupWord};
