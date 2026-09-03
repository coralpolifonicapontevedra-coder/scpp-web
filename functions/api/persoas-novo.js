import { obterJsonAppsScript } from '../_lib/apps-script.js';

const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

async function firebaseUser(idToken,apiKey){
  const token=String(idToken||'').trim();if(!token||!apiKey)return null;
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
  if(!r.ok)return null;const u=(await r.json())?.users?.[0];if(!u?.email||u.emailVerified!==true)return null;
  return{uid:String(u.localId||''),email:String(u.email).trim().toLowerCase()};
}

async function apps(env,user,accion,extra={}){
  const {resultado}=await obterJsonAppsScript(env,{token:env.WEB_WRITE_TOKEN,accion,email:user.email,uidFirebase:user.uid,...extra},{timeoutMs:30000,attemptTimeoutMs:12000});
  return resultado;
}

export async function onRequest({request,env}){
  if(request.method!=='POST')return json(405,{ok:false,erro:'Método non permitido'});
  if(!env.FIREBASE_API_KEY||!env.WEB_WRITE_TOKEN)return json(500,{ok:false,erro:'Falta configuración do servizo'});
  let data;try{data=await request.json();}catch{return json(400,{ok:false,erro:'Petición non válida'});}
  const user=await firebaseUser(data.idToken,env.FIREBASE_API_KEY);if(!user)return json(401,{ok:false,erro:'Sesión non válida'});
  const action=String(data.accion||'').trim();
  const mapa={listar:'persoasNovoListar',crear:'persoasNovoCrear',crearInvitacion:'persoasNovoCrear',actualizar:'persoasNovoActualizar',estado:'persoasNovoEstado'};
  const accion=mapa[action];if(!accion)return json(400,{ok:false,erro:'Acción non permitida'});
  const extra={};
  if(data.persoa&&typeof data.persoa==='object')extra.persoa=data.persoa;
  if(data.idPersoa)extra.idPersoa=String(data.idPersoa);
  if(typeof data.activo==='boolean')extra.activo=data.activo;
  if(data.aceptacion)extra.aceptacion=data.aceptacion;
  if(action==='crearInvitacion')extra.modo='invitacion';
  let result;try{result=await apps(env,user,accion,extra);}catch(error){return json(503,{ok:false,etapa:'APPS_SCRIPT',erro:error instanceof Error?error.message:'Fallou Apps Script'});}
  if(!result?.ok)return json(result?.erro==='Usuario non autorizado'?403:400,{ok:false,etapa:'APPS_SCRIPT_RESULT',erro:result?.erro||'Non foi posible completar a operación'});
  return json(200,{...result,api:'persoas-novo-v1'});
}
