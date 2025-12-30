import { json } from './_common.js';
export async function onRequestGet(){
  return json({ ok:true, service:"tteutgyeop-kbasicdict", ts: Date.now() });
}
