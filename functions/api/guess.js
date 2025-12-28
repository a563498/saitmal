
import {jsonResponse,lookupWord} from './_common.js';
export async function onRequestGet({request,env}){
  const w=new URL(request.url).searchParams.get('word');
  const g=await lookupWord(env,w);
  if(g.__error) return jsonResponse({ok:false,message:g.__error});
  return jsonResponse({ok:true,word:g.word,score:50,common:[]});
}
