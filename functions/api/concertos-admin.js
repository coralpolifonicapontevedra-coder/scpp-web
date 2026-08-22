import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const TIPOS_MEDIO = { cartel:new Set(['image/jpeg','image/png','image/webp']), triptico:new Set(['application/pdf','image/jpeg','image/png','image/webp']) };
const MAX_MEDIO_BYTES = 12 * 1024 * 1024;
const ATTENDANCE_INDEX_KEY = 'indices/asistencias-concertos.json';
const CONCERT_INDEX_KEY = 'indices/concertos-privado-v1.json';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  }
});
function erro(status, etapa, codigo, mensaxe) { return json(status, { ok:false, etapa, codigo, erro:mensaxe }); }
async function fetchConLimite(url, options, timeoutMs) { const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs); try{return await fetch(url,{...options,redirect:'follow',signal:controller.signal});}finally{clearTimeout(timer);} }
const tokenCache = new Map();
async function verificarFirebase(idToken, apiKey) { const token=String(idToken||'').trim(); if(!token)return null; const cached=tokenCache.get(token);if(cached?.expires>Date.now())return cached.user;let lastError;for(let attempt=0;attempt<2;attempt+=1){try{const response=await fetchConLimite(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})},TIMEOUT_FIREBASE_MS);if(!response.ok)return null;const data=(await response.json())?.users?.[0];if(!data?.email||data.emailVerified!==true)return null;const user={uid:String(data.localId||''),email:String(data.email).trim().toLowerCase()};tokenCache.set(token,{user,expires:Date.now()+5*60*1000});while(tokenCache.size>100)tokenCache.delete(tokenCache.keys().next().value);return user;}catch(error){lastError=error;}}throw lastError||new Error('Firebase non dispoñible'); }
async function hashEmail(email) { const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(email||'').trim().toLowerCase())); return Array.from(new Uint8Array(digest),(b)=>b.toString(16).padStart(2,'0')).join(''); }
async function verificarAdministracionR2(env,user) { if(!env.R2_PRIVADO||typeof env.R2_PRIVADO.get!=='function')return false; const key=`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`; const object=await env.R2_PRIVADO.get(key); if(!object)return false; const entry=await object.json().catch(()=>null); return entry?.administrador===user.email&&entry?.payload?.perfil?.nivel==='Administración'; }
async function chamarAppsScript(env,user,accion,datos={}) { const {resultado}=await obterJsonAppsScript(env,{token:env.WEB_WRITE_TOKEN,accion,email:user.email,uidFirebase:user.uid,...datos},{timeoutMs:TIMEOUT_APPS_SCRIPT_MS,attemptTimeoutMs:8_000}); if(!resultado?.ok){const message=resultado?.erro||'Apps Script non puido completar a operación.';const code=resultado?.codigo||(/non autorizado/i.test(message)?'FORBIDDEN':'APPS_SCRIPT_RESULT');throw Object.assign(new Error(message),{code});}return resultado; }
function bytesBase64(valor){const bin=atob(String(valor||''));const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;}
function extensionMedio(mime){return{'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[mime]||'bin';}
const clean=(value)=>String(value||'').trim();
const branch=(env)=>clean(env.CF_PAGES_BRANCH||'preview').replace(/[^a-zA-Z0-9._-]/g,'-')||'preview';
const draftKey=(env,id)=>`concertos/borradores-v1/${branch(env)}/${encodeURIComponent(clean(id))}.json`;
const attendanceKey=(env)=>branch(env)==='main'?ATTENDANCE_INDEX_KEY:'indices/preview/asistencias-concertos.json';
const concertIndexKey=(env)=>branch(env)==='main'?CONCERT_INDEX_KEY:'indices/preview/concertos-privado-v1.json';
async function readJson(bucket,key){if(!bucket?.get)return null;const object=await bucket.get(key);if(!object)return null;try{return await object.json();}catch{return null;}}
async function writeJson(bucket,key,value,type){await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'},customMetadata:{tipo:type,version:'1'}});return value;}
function validDraft(value,id){return value?.version===1&&value?.idConcerto===id&&Array.isArray(value.programa)&&Array.isArray(value.persoas)&&Array.isArray(value.obras);}
function fromManagement(result,id){return{version:1,idConcerto:id,updatedAt:new Date().toISOString(),programa:Array.isArray(result?.programa)?result.programa:[],persoas:Array.isArray(result?.persoas)?result.persoas:[],obras:Array.isArray(result?.obras)?result.obras:[]};}
function personFromR2(p){return{id:clean(p.idPersoa||p.id),nome:clean(p.nome),primeiroApelido:clean(p.primeiroApelido),segundoApelido:clean(p.segundoApelido),voz:clean(p.voz),estado:'',xustificacion:''};}
function workFromR2(o){return{id:clean(o.idRepertorio||o.id),nome:clean(o.nomeObra||o.nome||o.obra),autor:clean(o.compositor||o.autor)};}
async function managementFromR2(env,user,id){const admin=await readJson(env.R2_PRIVADO,`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`),catalog=await readJson(env.R2_PRIVADO,'repertorio/cache/catalogo.json'),concertIndex=await readJson(env.R2_PRIVADO,CONCERT_INDEX_KEY),attendance=await readJson(env.R2_PRIVADO,ATTENDANCE_INDEX_KEY);const persoas=(admin?.payload?.persoas||[]).map(personFromR2).filter(p=>p.id&&p.nome&&p.voz),obras=(catalog?.obras||[]).map(workFromR2).filter(o=>o.id&&o.nome),concert=(concertIndex?.concertos||[]).find(c=>clean(c.id)===id),programa=(concert?.programa||[]).map((p,index)=>({obraId:clean(p.idRepertorio||p.id),orde:Number(p.orde||index+1),notas:clean(p.notas),solista:clean(p.solista)})).filter(p=>p.obraId);const attendees=attendance?.resultado?.asistenciasPorConcerto?.[id]||[],keys=new Set(attendees.map(a=>`${clean(a.voz).toLowerCase()}|${clean(a.nome).toLowerCase()}`));for(const p of persoas){const full=`${[p.primeiroApelido,p.segundoApelido].filter(Boolean).join(' ')}, ${p.nome}`.toLowerCase();if(keys.has(`${p.voz.toLowerCase()}|${full}`))p.estado='asiste';}return fromManagement({programa,persoas,obras},id);}
async function getDraft(env,user,id){const key=draftKey(env,id),saved=await readJson(env.R2_PRIVADO,key);if(validDraft(saved,id))return saved;let initial;try{initial=fromManagement(await chamarAppsScript(env,user,'obterXestionConcertoAdministracionPortal',{idConcerto:id}),id);}catch(error){console.warn('Inicialízase a xestión de Concertos desde R2:',error);initial=await managementFromR2(env,user,id);}if(!initial.persoas.length||!initial.obras.length)throw Object.assign(new Error('Os catálogos R2 de persoas ou repertorio non están dispoñibles.'),{code:'R2_CATALOG_MISSING'});return writeJson(env.R2_PRIVADO,key,initial,'borrador-concerto');}
async function saveDraft(env,draft){return writeJson(env.R2_PRIVADO,draftKey(env,draft.idConcerto),{...draft,updatedAt:new Date().toISOString()},'borrador-concerto');}
function attendeeList(draft){return draft.persoas.filter(p=>p.estado==='asiste').map(p=>({nome:`${[clean(p.primeiroApelido),clean(p.segundoApelido)].filter(Boolean).join(' ')}, ${clean(p.nome)}`.replace(/^,\s*/,''),voz:clean(p.voz)||'Sen voz indicada'})).filter(p=>p.nome);}
async function updateAttendanceIndex(env,draft){const target=attendanceKey(env);let current=await readJson(env.R2_PRIVADO,target);if(!current&&target!==ATTENDANCE_INDEX_KEY)current=await readJson(env.R2_PRIVADO,ATTENDANCE_INDEX_KEY);const result=current?.resultado?.ok?current.resultado:{ok:true,asistenciasPorConcerto:{}};const por={...(result.asistenciasPorConcerto||{}),[draft.idConcerto]:attendeeList(draft)};return writeJson(env.R2_PRIVADO,target,{gardadoEn:Date.now(),resultado:{...result,ok:true,asistenciasPorConcerto:por}},'indice-asistencias-concertos');}
async function updateConcertIndex(env,draft){const target=concertIndexKey(env);let current=await readJson(env.R2_PRIVADO,target);if(!current&&target!==CONCERT_INDEX_KEY)current=await readJson(env.R2_PRIVADO,CONCERT_INDEX_KEY);if(!current?.ok||!Array.isArray(current.concertos))return null;const works=new Map(draft.obras.map(o=>[clean(o.id),o]));const programa=draft.programa.map((p,index)=>{const work=works.get(clean(p.obraId))||{};return{idRepertorio:clean(p.obraId),orde:index+1,obra:clean(work.nome)||clean(p.obraId),autor:clean(work.autor),notas:clean(p.notas),solista:clean(p.solista)};});const concertos=current.concertos.map(c=>clean(c.id)===draft.idConcerto?{...c,programa}:c);return writeJson(env.R2_PRIVADO,target,{...current,concertos,xeradoEn:new Date().toISOString(),xeradoEnMs:Date.now(),actualizadoDesde:'ADMIN-CONCERTOS'},'indice-concertos-privado');}

export async function onRequest(context) {
  const {request,env}=context;
  if(request.method!=='POST')return erro(405,'REQUEST','METHOD_NOT_ALLOWED','Método non permitido.');
  if(!env.WEB_WRITE_TOKEN||!env.FIREBASE_API_KEY)return erro(500,'CONFIG','MISSING_CONFIG','O servizo non está configurado correctamente.');
  let body; try{body=await request.json();}catch{return erro(400,'REQUEST','INVALID_JSON','Solicitude non válida.');}
  let user; try{user=await verificarFirebase(body.idToken,env.FIREBASE_API_KEY);}catch{return erro(503,'FIREBASE','FIREBASE_UNAVAILABLE','Non foi posible validar a sesión.');}
  if(!user)return erro(401,'AUTH','INVALID_SESSION','A identificación non é válida ou caducou.');
  try{
    const adminOk=await verificarAdministracionR2(env,user); if(!adminOk)return erro(403,'AUTH','FORBIDDEN','Usuario non autorizado para Administración.');
    const accion=String(body.accion||'listar').trim();
    if(accion==='listar'){const result=await chamarAppsScript(env,user,'listarConcertosAdministracionPortal');return json(200,{ok:true,nivel:result.nivel||'Administración',concertos:Array.isArray(result.concertos)?result.concertos:[]});}
    if(accion==='cambiarData'){const idConcerto=String(body.idConcerto||'').trim(),data=String(body.data||'').trim();if(!idConcerto||!/^\d{4}-\d{2}-\d{2}$/.test(data))return erro(400,'REQUEST','INVALID_DATA','Indica un concerto e unha data válida.');const result=await chamarAppsScript(env,user,'actualizarConcertoAdministracionPortal',{idConcerto,data});return json(200,{ok:true,resultado:result.resultado||result});}
    if(accion==='cambiarEstado'){const idConcerto=String(body.idConcerto||'').trim(),estado=String(body.estado||'').trim();const validos=new Set(['Previsto','Confirmado','Aprazado','Cancelado','Realizado']);if(!idConcerto||!validos.has(estado))return erro(400,'REQUEST','INVALID_DATA','Indica un concerto e un estado válido.');const result=await chamarAppsScript(env,user,'actualizarConcertoAdministracionPortal',{idConcerto,estado});return json(200,{ok:true,resultado:result.resultado||result});}
    if(accion==='gardarConcerto'){const result=await chamarAppsScript(env,user,'gardarConcertoAdministracionPortal',{concerto:body.concerto||{}});return json(200,{ok:true,resultado:result.resultado||result});}
    if(accion==='obterXestion'){const id=clean(body.idConcerto);if(!id)return erro(400,'REQUEST','INVALID_DATA','Falta identificar o concerto.');const draft=await getDraft(env,user,id);return json(200,{ok:true,...draft,almacen:'R2'});}
    if(accion==='gardarPrograma'){const id=clean(body.idConcerto);if(!id)return erro(400,'REQUEST','INVALID_DATA','Falta identificar o concerto.');const draft=await getDraft(env,user,id);draft.programa=Array.isArray(body.programa)?body.programa:[];await saveDraft(env,draft);return json(200,{ok:true,total:draft.programa.length,almacen:'R2'});}
    if(accion==='gardarAsistentes'){const id=clean(body.idConcerto);if(!id)return erro(400,'REQUEST','INVALID_DATA','Falta identificar o concerto.');const draft=await getDraft(env,user,id),updates=Array.isArray(body.persoas)?body.persoas:[],map=new Map(draft.persoas.map(p=>[clean(p.id),p]));for(const item of updates){const pid=clean(item.id);if(pid&&map.has(pid))map.set(pid,{...map.get(pid),...item});}draft.persoas=[...map.values()];await saveDraft(env,draft);return json(200,{ok:true,total:updates.length,almacen:'R2'});}
    if(accion==='finalizarXestion'){const id=clean(body.idConcerto);if(!id)return erro(400,'REQUEST','INVALID_DATA','Falta identificar o concerto.');const draft=await getDraft(env,user,id);await chamarAppsScript(env,user,'gardarProgramaConcertoAdministracionPortal',{idConcerto:id,programa:draft.programa});await chamarAppsScript(env,user,'gardarAsistentesConcertoAdministracionPortal',{idConcerto:id,persoas:draft.persoas.filter(p=>p.estado)});await Promise.all([updateAttendanceIndex(env,draft),updateConcertIndex(env,draft)]);return json(200,{ok:true,almacen:'SHEET+R2',resumo:{obras:draft.programa.length,asistencias:attendeeList(draft).length,rexistros:draft.persoas.filter(p=>p.estado).length}});}
    if(accion==='subirMedio'){
      const idConcerto=String(body.idConcerto||'').trim(),tipo=String(body.tipo||'').trim(),mimeType=String(body.mimeType||'').trim(),base64=String(body.base64||'');
      if(!idConcerto||!TIPOS_MEDIO[tipo]?.has(mimeType)||!base64)return erro(400,'REQUEST','INVALID_MEDIA','Selecciona un ficheiro válido.');
      const bytes=bytesBase64(base64);if(bytes.length>MAX_MEDIO_BYTES)return erro(413,'REQUEST','MEDIA_TOO_LARGE','O ficheiro supera o límite de 12 MB.');if(!env.R2_PRIVADO)return erro(500,'CONFIG','R2_NOT_CONFIGURED','R2 privado non está configurado.');
      const prefix=`concertos/admin/${encodeURIComponent(idConcerto)}/${tipo}/`;const existentes=await env.R2_PRIVADO.list({prefix});for(const obxecto of existentes.objects)await env.R2_PRIVADO.delete(obxecto.key);
      const key=`${prefix}${Date.now()}.${extensionMedio(mimeType)}`;await env.R2_PRIVADO.put(key,bytes,{httpMetadata:{contentType:mimeType,cacheControl:'private, max-age=300'},customMetadata:{idConcerto,tipo,subidoPor:user.email}});
      await chamarAppsScript(env,user,'actualizarMedioConcertoAdministracionPortal',{idConcerto,tipo,ruta:`r2://${key}`});return json(200,{ok:true,ruta:`r2://${key}`});
    }
    return erro(400,'REQUEST','ACTION_NOT_ALLOWED','Acción non permitida.');
  }catch(error){const code=error?.code||'UPSTREAM';const status=code==='FORBIDDEN'?403:code==='NOT_FOUND'?404:502;return erro(status,'APPS_SCRIPT',code,error?.message||'Non foi posible completar a operación.');}
}
