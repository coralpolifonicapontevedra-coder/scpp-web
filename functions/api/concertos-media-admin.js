import { obterJsonAppsScript } from '../_lib/apps-script.js';

const ADMIN_CACHE_PREFIX='persoas/cache/administracion/';
const MEDIA_INDEX_KEY='indices/concert-media-v1.json';
const MAX_CARTEL=12*1024*1024;
const MAX_TRIPTICO=30*1024*1024;
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function hashEmail(email){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(email||'').trim().toLowerCase()));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');}
async function verificarFirebase(idToken,apiKey){const token=String(idToken||'').trim();if(!token)return null;const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});if(!r.ok)return null;const u=(await r.json())?.users?.[0];return u?.email&&u.emailVerified===true?{uid:String(u.localId||''),email:String(u.email).trim().toLowerCase()}:null;}
async function verificarAdmin(env,user){const hash=await hashEmail(user.email);if(env.R2_PRIVADO?.get){const o=await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${hash}.json`);if(o){const e=await o.json().catch(()=>null);if(e?.administrador===user.email&&e?.payload?.perfil?.nivel==='Administración')return true;}}try{const {resultado}=await obterJsonAppsScript(env,{token:env.WEB_WRITE_TOKEN,accion:'listarPersoasAdministracion',email:user.email,uidFirebase:user.uid},{timeoutMs:20000,attemptTimeoutMs:8000});if(resultado?.ok&&resultado?.perfil?.nivel==='Administración'){if(env.R2_PRIVADO?.put){await env.R2_PRIVADO.put(`${ADMIN_CACHE_PREFIX}${hash}.json`,JSON.stringify({savedAt:Date.now(),administrador:user.email,payload:resultado}),{httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'}}).catch(()=>{});}return true;}}catch(e){console.warn('Erro ao validar admin:',e);}return false;}
function extension(nome,mime){const m=String(nome||'').toLowerCase().match(/\.([a-z0-9]{2,5})$/);if(m)return m[1];return mime==='application/pdf'?'pdf':mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';}
function nomeSeguro(id,tipo,ext){return `${String(id).replace(/[^A-Za-z0-9_-]/g,'_')}.${tipo}.${Date.now()}.${ext}`;}
async function lerIndice(env){const o=await env.R2_PRIVADO.get(MEDIA_INDEX_KEY);if(!o)return{version:1,entries:{}};const j=await o.json().catch(()=>null);return j?.version===1&&j.entries&&typeof j.entries==='object'?j:{version:1,entries:{}};}
async function gardarIndice(env,indice){indice.updatedAt=new Date().toISOString();await env.R2_PRIVADO.put(MEDIA_INDEX_KEY,JSON.stringify(indice),{httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'}});}
async function chamarApps(env,user,datos){const {resultado}=await obterJsonAppsScript(env,{token:env.WEB_WRITE_TOKEN,accion:'actualizarMedioConcertoAdministracionPortal',email:user.email,uidFirebase:user.uid,...datos},{timeoutMs:20000,attemptTimeoutMs:8000});if(!resultado?.ok)throw new Error(resultado?.erro||'Apps Script non puido actualizar o concerto.');return resultado;}
export async function onRequest({request,env}){
 if(request.method!=='POST')return json(405,{ok:false,erro:'Método non permitido.'});
 if(!env.R2_PRIVADO||!env.WEB_WRITE_TOKEN||!env.FIREBASE_API_KEY)return json(500,{ok:false,erro:'O servizo non está configurado correctamente.'});
 let form;try{form=await request.formData();}catch{return json(400,{ok:false,erro:'Formulario non válido.'});}
 const user=await verificarFirebase(form.get('idToken'),env.FIREBASE_API_KEY).catch(()=>null);if(!user)return json(401,{ok:false,erro:'A sesión non é válida ou caducou.'});
 if(!await verificarAdmin(env,user))return json(403,{ok:false,erro:'Usuario non autorizado para Administración.'});
 const idConcerto=String(form.get('idConcerto')||'').trim(),tipo=String(form.get('tipo')||'').trim().toLowerCase(),file=form.get('file');
 if(!idConcerto||!['cartel','triptico'].includes(tipo)||!(file instanceof File))return json(400,{ok:false,erro:'Faltan datos para subir o ficheiro.'});
 const mime=String(file.type||'application/octet-stream').toLowerCase();
 const permitido=tipo==='cartel'?['image/jpeg','image/png','image/webp'].includes(mime):['application/pdf','image/jpeg','image/png','image/webp'].includes(mime);
 if(!permitido)return json(400,{ok:false,erro:tipo==='cartel'?'O cartel debe ser JPG, PNG ou WEBP.':'O tríptico debe ser PDF, JPG, PNG ou WEBP.'});
 const limite=tipo==='cartel'?MAX_CARTEL:MAX_TRIPTICO;if(file.size<=0||file.size>limite)return json(400,{ok:false,erro:`O ficheiro supera o límite de ${Math.round(limite/1024/1024)} MB.`});
 const ext=extension(file.name,mime),nome=nomeSeguro(idConcerto,tipo,ext),buffer=await file.arrayBuffer();
 const digest=await crypto.subtle.digest('SHA-256',buffer),hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const prefix=tipo==='cartel'?'concertos/imaxes/objetos':'concertos/documentos/objetos',r2Key=`${prefix}/${hex}.${ext}`;
 const indice=await lerIndice(env),clave=nome.toLocaleLowerCase('gl');
 try{
  await env.R2_PRIVADO.put(r2Key,buffer,{httpMetadata:{contentType:mime,cacheControl:'public, max-age=86400'},customMetadata:{concerto:idConcerto,tipo,nomeOriginal:String(file.name||'')}});
  indice.entries[clave]={name:nome,r2Key,mimeType:mime,size:file.size,concertoId:idConcerto,tipo};
  await gardarIndice(env,indice);
  await chamarApps(env,user,{idConcerto,tipo,nomeFicheiro:nome});
  return json(200,{ok:true,medio:{nome,r2Key,mimeType:mime,size:file.size,url:`/media/concertos/${encodeURIComponent(nome)}`}});
 }catch(error){
  delete indice.entries[clave];
  await Promise.allSettled([gardarIndice(env,indice),env.R2_PRIVADO.delete(r2Key)]);
  return json(502,{ok:false,erro:error instanceof Error?error.message:'Non foi posible completar a subida.'});
 }
}
