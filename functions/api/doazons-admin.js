import { obterJsonAppsScript } from '../_lib/apps-script.js';

const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const clean=(v)=>String(v||'').trim();

async function firebase(token,key){
  if(!token||!key)return null;
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
  if(!r.ok)return null;
  const u=(await r.json())?.users?.[0];
  return u?.email&&u.emailVerified?{uid:clean(u.localId),email:clean(u.email).toLowerCase()}:null;
}

async function hash(email){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function admin(env,user){
  const o=await env.R2_PRIVADO?.get?.(`persoas/cache/administracion/${await hash(user.email)}.json`);
  if(!o)return false;
  const x=await o.json().catch(()=>null);
  return x?.administrador===user.email&&x?.payload?.perfil?.nivel==='Administración';
}

export async function onRequest({request,env}){
  if(request.method!=='POST')return json(405,{ok:false,erro:'Método non permitido.'});
  let body;
  try{body=await request.json();}catch{return json(400,{ok:false,erro:'Solicitude non válida.'});}
  const user=await firebase(clean(body.idToken),env.FIREBASE_API_KEY).catch(()=>null);
  if(!user)return json(401,{ok:false,erro:'A sesión non é válida.'});
  if(!(await admin(env,user)))return json(403,{ok:false,erro:'Só Administración pode xestionar as doazóns.'});

  const allowed=new Set(['listarDoazonsAdministracion','actualizarEstadoDoazonAdministracion','eliminarDoazonAdministracion']);
  const accion=clean(body.accion);
  if(!allowed.has(accion))return json(400,{ok:false,erro:'Acción non permitida.'});

  const payload={...body,token:env.WEB_WRITE_TOKEN,email:user.email,actorEmail:user.email,uidFirebase:user.uid,accion};
  delete payload.idToken;
  try{
    const {resultado}=await obterJsonAppsScript(env,payload,{timeoutMs:20000,attemptTimeoutMs:9000});
    return json(resultado?.ok?200:400,resultado||{ok:false,erro:'Resposta baleira.'});
  }catch(error){
    return json(502,{ok:false,erro:error instanceof Error?error.message:'Non foi posible acceder ás doazóns.'});
  }
}
