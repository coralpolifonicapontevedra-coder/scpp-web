import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const TIPOS_MEDIO = { cartel:new Set(['image/jpeg','image/png','image/webp']), triptico:new Set(['application/pdf','image/jpeg','image/png','image/webp']) };
const MAX_MEDIO_BYTES = 12 * 1024 * 1024;

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
async function verificarFirebase(idToken, apiKey) { const token=String(idToken||'').trim(); if(!token)return null; const response=await fetchConLimite(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})},TIMEOUT_FIREBASE_MS); if(!response.ok)return null; const user=(await response.json())?.users?.[0]; if(!user?.email||user.emailVerified!==true)return null; return{uid:String(user.localId||''),email:String(user.email).trim().toLowerCase()}; }
async function hashEmail(email) { const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(email||'').trim().toLowerCase())); return Array.from(new Uint8Array(digest),(b)=>b.toString(16).padStart(2,'0')).join(''); }
async function verificarAdministracionR2(env,user) { if(!env.R2_PRIVADO||typeof env.R2_PRIVADO.get!=='function')return false; const key=`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`; const object=await env.R2_PRIVADO.get(key); if(!object)return false; const entry=await object.json().catch(()=>null); return entry?.administrador===user.email&&entry?.payload?.perfil?.nivel==='Administración'; }
async function chamarAppsScript(env,user,accion,datos={}) { const {resultado}=await obterJsonAppsScript(env,{token:env.WEB_WRITE_TOKEN,accion,email:user.email,uidFirebase:user.uid,...datos},{timeoutMs:TIMEOUT_APPS_SCRIPT_MS,attemptTimeoutMs:8_000}); if(!resultado?.ok){const message=resultado?.erro||'Apps Script non puido completar a operación.';const code=resultado?.codigo||(/non autorizado/i.test(message)?'FORBIDDEN':'APPS_SCRIPT_RESULT');throw Object.assign(new Error(message),{code});}return resultado; }
function bytesBase64(valor){const bin=atob(String(valor||''));const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;}
function extensionMedio(mime){return{'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[mime]||'bin';}

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
    if(accion==='obterXestion'){const result=await chamarAppsScript(env,user,'obterXestionConcertoAdministracionPortal',{idConcerto:String(body.idConcerto||'')});return json(200,result);}
    if(accion==='gardarPrograma'){const result=await chamarAppsScript(env,user,'gardarProgramaConcertoAdministracionPortal',{idConcerto:String(body.idConcerto||''),programa:Array.isArray(body.programa)?body.programa:[]});return json(200,result);}
    if(accion==='gardarAsistentes'){const result=await chamarAppsScript(env,user,'gardarAsistentesConcertoAdministracionPortal',{idConcerto:String(body.idConcerto||''),persoas:Array.isArray(body.persoas)?body.persoas:[]});return json(200,result);}
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
