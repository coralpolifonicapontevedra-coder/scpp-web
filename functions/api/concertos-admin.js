import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';

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
    if(accion==='novo'){
      const data=String(body.data||'').trim(),nome=String(body.nome||'').trim(),estado=String(body.estado||'Previsto').trim();
      const validos=new Set(['Previsto','Confirmado','Aprazado','Cancelado','Realizado']);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(data)||!nome||!validos.has(estado))return erro(400,'REQUEST','INVALID_DATA','Indica nome, data e estado válidos.');
      const result=await chamarAppsScript(env,user,'crearConcertoAdministracionPortal',{data,nome,cidade:String(body.cidade||'').trim(),lugar:String(body.lugar||'').trim(),hora:String(body.hora||'').trim(),caracteristicas:String(body.caracteristicas||'').trim(),estado});
      return json(200,{ok:true,resultado:result.resultado||result});
    }
    if(accion==='cambiarData'){const idConcerto=String(body.idConcerto||'').trim(),data=String(body.data||'').trim();if(!idConcerto||!/^\d{4}-\d{2}-\d{2}$/.test(data))return erro(400,'REQUEST','INVALID_DATA','Indica un concerto e unha data válida.');const result=await chamarAppsScript(env,user,'actualizarConcertoAdministracionPortal',{idConcerto,data});return json(200,{ok:true,resultado:result.resultado||result});}
    if(accion==='cambiarEstado'){const idConcerto=String(body.idConcerto||'').trim(),estado=String(body.estado||'').trim();const validos=new Set(['Previsto','Confirmado','Aprazado','Cancelado','Realizado']);if(!idConcerto||!validos.has(estado))return erro(400,'REQUEST','INVALID_DATA','Indica un concerto e un estado válido.');const result=await chamarAppsScript(env,user,'actualizarConcertoAdministracionPortal',{idConcerto,estado});return json(200,{ok:true,resultado:result.resultado||result});}
    return erro(400,'REQUEST','ACTION_NOT_ALLOWED','Acción non permitida.');
  }catch(error){const code=error?.code||'UPSTREAM';const status=code==='FORBIDDEN'?403:code==='NOT_FOUND'?404:502;return erro(status,'APPS_SCRIPT',code,error?.message||'Non foi posible completar a operación.');}
}
