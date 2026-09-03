const TIMEOUT_FIREBASE_MS=8000;
const PERFIS_R2_KEY='persoas/cache/perfis.json';
const PERFIL_R2_PREFIX='persoas/cache/perfis/';
const DRAFT_PREFIX='ensaios/borradores-v1/';
const ENSAIOS_CACHE_PREFIX='ensaios/cache-v2/usuarios/';
const CONCERTOS_PRIVATE_INDEX_KEY='indices/concertos-privado-v1.json';
const clean=v=>String(v==null?'':v).trim();
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const json=(s,b)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function fetchLimit(url,options,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,signal:c.signal})}finally{clearTimeout(t)}}
async function verify(idToken,apiKey){const token=clean(idToken);if(!token)return null;const r=await fetchLimit(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})},TIMEOUT_FIREBASE_MS);if(!r.ok)return null;const u=(await r.json())?.users?.[0];return u?.email&&u.emailVerified===true?{email:clean(u.email).toLowerCase()}:null}
async function sha(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(clean(v).toLowerCase()));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('')}
async function read(env,key){const o=await env.R2_PRIVADO.get(key);if(!o)return null;try{return await o.json()}catch{return null}}
const mail=p=>clean(p?.correoElectronico||p?.correo||p?.email).toLowerCase();
function active(p){const voz=clean(p?.voz||p?.Voz),estado=clean(p?.activo??p?.Activo??p?.estado??p?.Estado).toLowerCase();return Boolean(voz)&&!['baixa','baja','inactivo','inactiva','false','0'].includes(estado)}
async function profile(env,email){const i=await read(env,`${PERFIL_R2_PREFIX}${await sha(email)}.json`);if(i?.payload?.ok&&i.payload.perfil)return i.payload.perfil;const idx=await read(env,PERFIS_R2_KEY);return Array.isArray(idx?.persoas)?idx.persoas.find(p=>mail(p)===email)||null:null}
async function latestSharedPayload(env){let cursor;let best=null;for(let page=0;page<3;page+=1){const listed=await env.R2_PRIVADO.list({prefix:ENSAIOS_CACHE_PREFIX,cursor,limit:100});for(const object of listed.objects||[]){const entry=await read(env,object.key);if(!entry?.payload?.ok||entry.payload.version!==2||!Array.isArray(entry.payload.ensaiosRepertorio))continue;const savedAt=Number(entry.savedAt||0);if(!best||savedAt>best.savedAt)best={savedAt,payload:entry.payload}}if(!listed.truncated||!listed.cursor)break;cursor=listed.cursor}return best?.payload||null}
const rehearsalId=row=>clean(row?.ensaio||row?.idEnsaio);
const workId=row=>clean(row?.repertorio||row?.idRepertorio);
function normalizeWork(row,id,index){return{ensaio:id,repertorio:workId(row),orde:Number(row?.orde||index+1),tipoTraballo:clean(row?.tipoTraballo),desde:clean(row?.desde),ata:clean(row?.ata),observacions:clean(row?.observacions)}}
async function worksFromConcert(env,source,id){
  const ensaio=(Array.isArray(source?.ensaios)?source.ensaios:[]).find(row=>clean(row?.idEnsaio||row?.id)===id);
  const idConcerto=clean(ensaio?.concerto||ensaio?.idConcerto);
  if(!idConcerto)return[];
  const index=await read(env,CONCERTOS_PRIVATE_INDEX_KEY);
  const concerto=(Array.isArray(index?.concertos)?index.concertos:[]).find(row=>clean(row?.id||row?.idConcerto)===idConcerto);
  if(!concerto)return[];
  const repertorio=Array.isArray(source?.repertorio)?source.repertorio:[];
  const byTitle=new Map();
  for(const obra of repertorio){const wid=clean(obra?.idRepertorio||obra?.id);const title=norm(obra?.nomeObra||obra?.nome||obra?.obra||obra?.titulo);if(wid&&title&&!byTitle.has(title))byTitle.set(title,wid)}
  const rows=[];
  for(const item of Array.isArray(concerto?.programa)?concerto.programa:[]){const direct=clean(item?.idRepertorio||item?.obraId||item?.repertorio||item?.id);const wid=direct||byTitle.get(norm(item?.obra||item?.titulo||item?.nomeObra||item?.nome))||'';if(wid&&!rows.some(row=>row.repertorio===wid))rows.push({ensaio:id,repertorio:wid,orde:Number(item?.orde||rows.length+1),tipoTraballo:'',desde:'',ata:'',observacions:''})}
  return rows;
}
export async function onRequest({request,env}){if(request.method!=='POST')return json(405,{ok:false,erro:'Método non permitido.'});let b;try{b=await request.json()}catch{return json(400,{ok:false,erro:'Solicitude non válida.'})}const u=await verify(b.idToken,env.FIREBASE_API_KEY).catch(()=>null);if(!u)return json(401,{ok:false,erro:'A identificación non é válida ou caducou.'});const p=await profile(env,u.email);if(!p||!active(p))return json(403,{ok:false,erro:'Usuario non autorizado.'});const id=clean(b.idEnsaio);if(!id)return json(400,{ok:false,erro:'Falta identificar o ensaio.'});const draft=await read(env,`${DRAFT_PREFIX}${await sha(id)}.json`);const draftRepertorio=draft&&draft.idEnsaio===id&&Array.isArray(draft.repertorio)?draft.repertorio.filter(row=>workId(row)):[];let fallbackRepertorio=[];let source=null;if(!draftRepertorio.length){source=await latestSharedPayload(env);fallbackRepertorio=(Array.isArray(source?.ensaiosRepertorio)?source.ensaiosRepertorio:[]).filter(row=>rehearsalId(row)===id&&workId(row)).map((row,index)=>normalizeWork(row,id,index))}let concertRepertorio=[];if(!draftRepertorio.length&&!fallbackRepertorio.length&&source)concertRepertorio=await worksFromConcert(env,source,id);const repertorio=draftRepertorio.length?draftRepertorio:fallbackRepertorio.length?fallbackRepertorio:concertRepertorio;const almacen=draftRepertorio.length?'R2-DRAFT':fallbackRepertorio.length?'R2-CACHE':concertRepertorio.length?'R2-CONCERT-PROGRAM':'R2';return json(200,{ok:true,draft:{version:1,idEnsaio:id,updatedAt:draft?.updatedAt||'',repertorio,asistencias:[]},almacen});}
