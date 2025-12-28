import { jsonResponse } from './_common.js';
export async function onRequestGet(){ return jsonResponse({ ok:true, service:"tteutgyeop", ts:Date.now() }); }
