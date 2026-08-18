const TIMEOUT_FIREBASE_MS=8000;
const PERFIS_R2_KEY='persoas/cache/perfis.json';
const PERFIL_R2_PREFIX='persoas/cache/perfis/';
const DRAFT_PREFIX='ensaios/borradores-v1/';
const clean=v=>String(v==null?'':v).trim();
const json=(s,b)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function fetchLimit(url,options,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,signal:c.signal})}finally{clearTimeout(t)}}
async function verify(idToken,apiKey){const token=clean(idToken);if(!token)return null;const r=await fetchLimit(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})},TIMEOUT_FIREBASE_MS);if(!r.ok)return null;const u=(await r.json())?.users?.[0];return u?.email&&u.emailVerified===true?{email:clean(u.email).toLowerCase()}:null}
async function sha(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(clean(v).toLowerCase()));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('')}
async function read(env,key){const o=await env.R2_PRIVADO.get(key);if(!o)return null;try{return await o.json()}catch{return null}}
const mail=p=>clean(p?.correoElectronico||p?.correo||p?.email||p?.['Correo electrónico']||p?.Email).toLowerCase();
const personId=p=>clean(p?.idPersoa||p?.id||p?.Id||p?.rowId||p?.RowID||p?.['Row ID']);
function active(p){const voz=clean(p?.voz||p?.Voz),estado=clean(p?.activo??p?.Activo??p?.estado??p?.Estado).toLowerCase();return Boolean(voz)&&!['baixa','baja','inactivo','inactiva','false','0'].includes(estado)}
async function profile(env,email){
  const individual=await read(env,`${PERFIL_R2_PREFIX}${await sha(email)}.json`);
  const perfilIndividual=individual?.payload?.ok&&individual.payload.perfil?individual.payload.perfil:null;
  if(perfilIndividual&&personId(perfilIndividual))return perfilIndividual;
  const idx=await read(env,PERFIS_R2_KEY);
  const persoa=Array.isArray(idx?.persoas)?idx.persoas.find(p=>mail(p)===email)||null:null;
  return persoa||perfilIndividual;
}
async function writeDraft(env,draft){const value={...draft,updatedAt:new Date().toISOString()};await env.R2_PRIVADO.put(`${DRAFT_PREFIX}${await sha(value.idEnsaio)}.json`,JSON.stringify(value),{httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'}});return value}
export async function onRequest({request,env}){if(request.method!=='POST')return json(405,{ok:false,erro:'Método non permitido.'});if(!env.FIREBASE_API_KEY||!env.R2_PRIVADO)return json(500,{ok:false,erro:'O servizo non está configurado.'});let b;try{b=await request.json()}catch{return json(400,{ok:false,erro:'Solicitude non válida.'})}const u=await verify(b.idToken,env.FIREBASE_API_KEY).catch(()=>null);if(!u)return json(401,{ok:false,erro:'A identificación non é válida ou caducou.'});const p=await profile(env,u.email),idPersoa=personId(p);if(!p||!active(p)||!idPersoa)return json(403,{ok:false,erro:'Non foi posible identificar o teu rexistro de coralista.'});const idEnsaio=clean(b.idEnsaio);if(!idEnsaio)return json(400,{ok:false,erro:'Falta identificar o ensaio.'});const xustificada=b.xustificada===true,motivo=clean(b.motivo).slice(0,240);if(xustificada&&!motivo)return json(400,{ok:false,erro:'Indica o motivo da xustificación.'});const key=`${DRAFT_PREFIX}${await sha(idEnsaio)}.json`;let draft=await read(env,key);if(!draft||draft.idEnsaio!==idEnsaio||!Array.isArray(draft.repertorio)||!Array.isArray(draft.asistencias))draft={version:1,idEnsaio,updatedAt:new Date().toISOString(),repertorio:[],asistencias:[]};const map=new Map(draft.asistencias.map(a=>[clean(a.persoa||a.idPersoa),a]));const prev=map.get(idPersoa)||{};map.set(idPersoa,{...prev,ensaio:idEnsaio,persoa:idPersoa,estadoAsistencia:'Non asiste',xustificada,motivo:xustificada?motivo:'',observacions:clean(prev.observacions)});draft=await writeDraft(env,{...draft,asistencias:[...map.values()]});return json(200,{ok:true,resultado:{idEnsaio,idPersoa,estadoAsistencia:'Non asiste',xustificada,motivo:xustificada?motivo:''},updatedAt:draft.updatedAt,almacen:'R2'});}
