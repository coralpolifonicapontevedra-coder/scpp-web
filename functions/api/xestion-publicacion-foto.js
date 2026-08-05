import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_PUBLICO='indices/galeria-publica-v1.json';
const INDEX_PRIVADO='indices/galeria-privada.json';
const CATALOGO='indices/catalogo-fotos.json';
const CACHE_REVISION='cache/fotos/listar-revision.json';
const AUTH_TTL_MS=12*60*60*1000;
const texto=v=>String(v??'').trim();
const idFoto=f=>texto(f?.idFoto||f?.Id_Foto||f?.id||f?.Id||f?.ID||f?.rowId||f?.['Row ID']);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

async function verificarToken(idToken,apiKey){
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken})});
  if(!r.ok)return null;const u=(await r.json())?.users?.[0];
  return u?.email&&u.emailVerified===true?{uid:texto(u.localId),email:texto(u.email).toLowerCase()}:null;
}
async function claveCorreo(email){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(texto(email).toLowerCase()));return [...new Uint8Array(h)].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function comprobarAdmin(env,u){
  const c=await env.R2_PRIVADO.get(`cache/autorizacion-fotos/${await claveCorreo(u.email)}.json`);
  if(c){const d=await c.json().catch(()=>null);const t=Date.parse(texto(d?.verificadaEn));if(d?.administrador===true&&Number.isFinite(t)&&Date.now()-t<AUTH_TTL_MS)return}
  const {resultado}=await obterJsonAppsScript(env,{token:env.WEB_WRITE_TOKEN,accion:'listarFotosRevision',email:u.email,uidFirebase:u.uid},{timeoutMs:35000,attemptTimeoutMs:12000});
  if(!resultado?.ok)throw new Error(resultado?.erro||'Administración non autorizada');
}
async function ler(bucket,clave){const o=await bucket.get(clave);if(!o)return {ok:true,fotos:[],total:0};const d=await o.json().catch(()=>null);if(!d||!Array.isArray(d.fotos))throw new Error(`Índice non válido: ${clave}`);return d}
async function gardar(bucket,clave,indice,publico=false){await bucket.put(clave,JSON.stringify(indice),{httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:publico?'public, max-age=0, no-cache, must-revalidate':'private, max-age=0, no-cache, must-revalidate'}})}
function preparar(indice,fotos,orixe){const agora=new Date();return {...indice,ok:true,fotos,total:fotos.length,xeradoEn:agora.toISOString(),xeradoEnMs:agora.getTime(),actualizadoDesde:orixe,version:'4'}}
function mapa(...listas){const m=new Map();for(const lista of listas)for(const f of lista||[]){const id=idFoto(f);if(id)m.set(id,{...(m.get(id)||{}),...f,idFoto:id})}return m}
function ruta(f,tipo){return texto(tipo==='publica'?(f?.rutaR2Publica||f?.rutaR2):(f?.rutaR2Privada||f?.rutaR2))}
function fichaEstado(f,pub,pri){const id=idFoto(f);return {...f,idFoto:id,publicarPublica:pub.has(id),publicarPrivada:pri.has(id),estadoPublicacion:pub.has(id)&&pri.has(id)?'ambas':pub.has(id)?'publica':pri.has(id)?'privada':'ningunha'} }
async function sincronizarSheet(env,u,id,publica,privada){const {resultado}=await obterJsonAppsScript(env,{token:env.WEB_WRITE_TOKEN,accion:'actualizarPublicacionFoto',email:u.email,uidFirebase:u.uid,rowId:id,idFoto:id,publicarPublica:publica,publicarPrivada:privada,destacadaPublica:false,destacadaPrivada:false},{timeoutMs:60000,attemptTimeoutMs:20000});if(!resultado?.ok)throw new Error(resultado?.erro||'Non se puido actualizar a Sheet')}

export async function onRequest({request,env}){
  if(request.method!=='POST')return json(405,{ok:false,erro:'Método non permitido'});
  if(!env.FIREBASE_API_KEY||!env.WEB_WRITE_TOKEN||!env.R2_PUBLICO||!env.R2_PRIVADO)return json(500,{ok:false,erro:'Servizo non configurado'});
  let datos;try{datos=await request.json()}catch{return json(400,{ok:false,erro:'Solicitude non válida'})}
  const u=await verificarToken(texto(datos.idToken),env.FIREBASE_API_KEY).catch(()=>null);if(!u)return json(401,{ok:false,erro:'Identificación non válida ou caducada'});
  try{
    await comprobarAdmin(env,u);
    const [pub0,pri0,cat0]=await Promise.all([ler(env.R2_PUBLICO,INDEX_PUBLICO),ler(env.R2_PRIVADO,INDEX_PRIVADO),ler(env.R2_PRIVADO,CATALOGO)]);
    const mp=mapa(cat0.fotos,pub0.fotos,pri0.fotos);const idsPub=new Set(pub0.fotos.map(idFoto));const idsPri=new Set(pri0.fotos.map(idFoto));
    if(texto(datos.accion||'listar')==='listar'){
      const fotos=[...mp.values()].map(f=>fichaEstado(f,idsPub,idsPri)).sort((a,b)=>texto(a.titulo||a.peFoto||a.idFoto).localeCompare(texto(b.titulo||b.peFoto||b.idFoto),'gl'));
      const cat=preparar(cat0,fotos,'CATALOGO-FOTOS');await gardar(env.R2_PRIVADO,CATALOGO,cat);
      return json(200,{ok:true,fotos,total:fotos.length,publicas:idsPub.size,privadas:idsPri.size,nonPublicadas:fotos.filter(f=>f.estadoPublicacion==='ningunha').length});
    }
    const id=texto(datos.idFoto);if(!id||!mp.has(id))return json(404,{ok:false,erro:'Fotografía non localizada no catálogo'});
    const publica=datos.publicarPublica===true,privada=datos.publicarPrivada===true;const base=mp.get(id);const op=crypto.randomUUID();
    const fotoPub={...base,idFoto:id,rutaR2Publica:ruta(base,'publica')||ruta(base,'privada'),publicarPublica:true};
    const fotoPri={...base,idFoto:id,rutaR2Privada:ruta(base,'privada')||ruta(base,'publica'),publicarPrivada:true};
    if(publica&&!fotoPub.rutaR2Publica)throw new Error('A fotografía non ten ruta R2 recuperable para a galería pública');
    if(privada&&!fotoPri.rutaR2Privada)throw new Error('A fotografía non ten ruta R2 recuperable para a galería privada');
    const pubFotos=pub0.fotos.filter(f=>idFoto(f)!==id);if(publica)pubFotos.push(fotoPub);
    const priFotos=pri0.fotos.filter(f=>idFoto(f)!==id);if(privada)priFotos.push(fotoPri);
    const pub1=preparar(pub0,pubFotos,'XESTOR-PUBLICACION-'+op),pri1=preparar(pri0,priFotos,'XESTOR-PUBLICACION-'+op);
    await Promise.all([gardar(env.R2_PUBLICO,INDEX_PUBLICO,pub1,true),gardar(env.R2_PRIVADO,INDEX_PRIVADO,pri1,false)]);
    try{await sincronizarSheet(env,u,id,publica,privada)}catch(e){await Promise.allSettled([gardar(env.R2_PUBLICO,INDEX_PUBLICO,pub0,true),gardar(env.R2_PRIVADO,INDEX_PRIVADO,pri0,false)]);throw e}
    const catMap=mapa(cat0.fotos,[{...base,idFoto:id,publicarPublica:publica,publicarPrivada:privada,estadoPublicacion:publica&&privada?'ambas':publica?'publica':privada?'privada':'ningunha'}]);
    await Promise.all([gardar(env.R2_PRIVADO,CATALOGO,preparar(cat0,[...catMap.values()],'XESTOR-PUBLICACION-'+op)),env.R2_PRIVADO.delete(CACHE_REVISION)]);
    const [pv,rv]=await Promise.all([ler(env.R2_PUBLICO,INDEX_PUBLICO),ler(env.R2_PRIVADO,INDEX_PRIVADO)]);
    if(pv.fotos.some(f=>idFoto(f)===id)!==publica||rv.fotos.some(f=>idFoto(f)===id)!==privada)throw new Error('A verificación final non coincide co estado solicitado');
    return json(200,{ok:true,idFoto:id,publicarPublica:publica,publicarPrivada:privada,estadoPublicacion:publica&&privada?'ambas':publica?'publica':privada?'privada':'ningunha',mensaxe:'Estado actualizado e verificado en Sheet, R2 e caché.'});
  }catch(e){console.error('Erro no xestor de publicación fotográfica',e);return json(503,{ok:false,erro:e instanceof Error?e.message:'Non se puido completar a operación'})}
}
