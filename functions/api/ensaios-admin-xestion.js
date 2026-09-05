import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const INDEX_MAIN = 'indices/ensaios-administracion-v2.json';
const INDEX_PREVIEW = 'indices/preview/ensaios-administracion-v2.json';
const DRAFT_PREFIX = 'ensaios/borradores-v2/';
const CONCERT_MAIN = 'indices/concertos-privado-v1.json';
const CONCERT_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const TIMEOUT_APPS_SCRIPT_MS = 20_000;

const clean = (v) => String(v ?? '').trim();
const rama = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const indexKey = (env) => rama(env) === 'main' ? INDEX_MAIN : INDEX_PREVIEW;
const concertKey = (env) => rama(env) === 'main' ? CONCERT_MAIN : CONCERT_PREVIEW;
const draftKey = (env, id) => `${DRAFT_PREFIX}${rama(env)}/${encodeURIComponent(clean(id))}.json`;
const idEnsaio = (r={}) => clean(r.ensaio || r.idEnsaio || r.Id_Ensaio);
const idPersoa = (r={}) => clean(r.persoa || r.idPersoa || r.Id_Persoa);
const idObra = (r={}) => clean(r.repertorio || r.idRepertorio || r.Id_Repertorio);

const json = (status, body, extra={}) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    ...extra
  }
});
const fail = (status, codigo, erro) => json(status, { ok:false, codigo, erro });

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const obj = await bucket.get(key);
  if (!obj) return null;
  return obj.json().catch(() => null);
}
async function writeJson(bucket, key, value, tipo) {
  if (!bucket?.put) throw Object.assign(new Error('R2 privado non está dispoñible.'), { code:'R2_NOT_CONFIGURED' });
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' },
    customMetadata:{ tipo, version:'2' }
  });
  return value;
}

async function firebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ idToken:token })
  });
  if (!r.ok) return null;
  const u = (await r.json())?.users?.[0];
  if (!u?.email || u.emailVerified !== true) return null;
  return { uid:clean(u.localId), email:clean(u.email).toLowerCase() };
}
async function permisoEnsaios(env, user) {
  let p = await obterPermisoPortalCacheado(env, user, 'ensaios');
  if (!p) p = await obterPermisoPortal(env, user, 'ensaios');
  return p;
}
async function apps(env, user, accion, datos={}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token:env.WEB_WRITE_TOKEN, accion, email:user.email, uidFirebase:user.uid, ...datos
  }, { timeoutMs:TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs:8_000 });
  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

function asistencia(row, ensaio) {
  return {
    ensaio,
    persoa:idPersoa(row),
    estadoAsistencia:clean(row.estadoAsistencia),
    xustificada:row.xustificada === true,
    motivo:clean(row.motivo),
    observacions:clean(row.observacions)
  };
}
function obra(row, ensaio, orde=999) {
  return {
    ensaio,
    repertorio:idObra(row),
    orde:Number(row.orde) || orde,
    tipoTraballo:clean(row.tipoTraballo),
    desde:clean(row.desde),
    ata:clean(row.ata),
    observacions:clean(row.observacions)
  };
}
function indexValid(i) {
  return i?.ok === true && i?.version === 2 && Array.isArray(i.ensaios) && Array.isArray(i.persoas) &&
    Array.isArray(i.asistencias) && Array.isArray(i.ensaiosRepertorio) && Array.isArray(i.repertorio);
}
async function concertos(env) {
  let c = await readJson(env.R2_PRIVADO, concertKey(env));
  if (!c && concertKey(env) !== CONCERT_MAIN) c = await readJson(env.R2_PRIVADO, CONCERT_MAIN);
  return c?.ok === true && Array.isArray(c.concertos) ? c.concertos : [];
}
async function seedIndex(env, user) {
  const r = await apps(env, user, 'listarEnsaiosPortal');
  const revision = Date.now();
  const index = {
    ok:true, version:2, revision, xeradoEn:new Date(revision).toISOString(),
    ensaios:Array.isArray(r.ensaios) ? r.ensaios : [],
    persoas:Array.isArray(r.persoas) ? r.persoas : [],
    asistencias:Array.isArray(r.asistencias) ? r.asistencias : [],
    ensaiosRepertorio:Array.isArray(r.ensaiosRepertorio) ? r.ensaiosRepertorio : [],
    repertorio:Array.isArray(r.repertorio) ? r.repertorio : [],
    concertos:await concertos(env),
    seguimento:r.seguimento || {}
  };
  await writeJson(env.R2_PRIVADO, indexKey(env), index, 'indice-ensaios-administracion');
  return index;
}
async function getIndex(env, user, force=false) {
  if (!force) {
    const i = await readJson(env.R2_PRIVADO, indexKey(env));
    if (indexValid(i)) return { index:i, fonte:'R2' };
  }
  return { index:await seedIndex(env, user), fonte:'SHEET-SEED' };
}

function draftFromIndex(index, ensaio) {
  const repertorio = index.ensaiosRepertorio.filter(r => idEnsaio(r) === ensaio)
    .map((r,i) => obra(r, ensaio, i+1)).filter(r => r.repertorio);
  const asistencias = index.asistencias.filter(r => idEnsaio(r) === ensaio)
    .map(r => asistencia(r, ensaio)).filter(r => r.persoa);
  return {
    version:2, idEnsaio:ensaio, baseRevision:Number(index.revision || 0), dirty:false,
    updatedAt:new Date().toISOString(), repertorio, asistencias,
    baseRepertorio:repertorio.map(r => ({...r})), baseAsistencias:asistencias.map(r => ({...r}))
  };
}
function draftValid(d, ensaio) {
  return d?.version === 2 && d?.idEnsaio === ensaio && Array.isArray(d.repertorio) && Array.isArray(d.asistencias) &&
    Array.isArray(d.baseRepertorio) && Array.isArray(d.baseAsistencias);
}
async function saveDraft(env, d) {
  return writeJson(env.R2_PRIVADO, draftKey(env, d.idEnsaio), { ...d, updatedAt:new Date().toISOString() }, 'borrador-ensaio');
}
async function getDraft(env, index, ensaio) {
  const saved = await readJson(env.R2_PRIVADO, draftKey(env, ensaio));
  if (!draftValid(saved, ensaio)) return saveDraft(env, draftFromIndex(index, ensaio));
  if (saved.dirty === true) return saved;
  if (Number(saved.baseRevision || 0) === Number(index.revision || 0)) return saved;
  return saveDraft(env, draftFromIndex(index, ensaio));
}

function eqAtt(a,b) {
  return clean(a?.estadoAsistencia) === clean(b?.estadoAsistencia) && (a?.xustificada===true)===(b?.xustificada===true) &&
    clean(a?.motivo)===clean(b?.motivo) && clean(a?.observacions)===clean(b?.observacions);
}
function eqWork(a,b) {
  return clean(a?.tipoTraballo)===clean(b?.tipoTraballo) && clean(a?.desde)===clean(b?.desde) &&
    clean(a?.ata)===clean(b?.ata) && clean(a?.observacions)===clean(b?.observacions);
}
async function seq(items, worker) { for (const item of items) await worker(item); }
function resolveProgram(programa, repertorio) {
  const ids = new Set(repertorio.map(o => clean(o.idRepertorio || o.id)).filter(Boolean));
  const norm = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const byTitle = new Map(repertorio.map(o => [norm(o.nomeObra || o.nome), clean(o.idRepertorio || o.id)]).filter(([k,v]) => k && v));
  return [...new Set((Array.isArray(programa)?programa:[]).map(p => {
    const direct = clean(p.idRepertorio || p.obraId || p.repertorio || p.id);
    if (direct && ids.has(direct)) return direct;
    return byTitle.get(norm(p.obra || p.titulo || p.nomeObra || p.nome)) || '';
  }).filter(Boolean))];
}

async function finalizar(env, user, draft) {
  const baseW = new Map(draft.baseRepertorio.map(r => [idObra(r), r]));
  const nowW = new Map(draft.repertorio.map(r => [idObra(r), r]));
  const baseA = new Map(draft.baseAsistencias.map(r => [idPersoa(r), r]));
  const nowA = new Map(draft.asistencias.map(r => [idPersoa(r), r]));
  const delW = [...baseW.keys()].filter(id => id && !nowW.has(id));
  const saveW = [...nowW.values()].filter(r => !baseW.has(idObra(r)) || !eqWork(baseW.get(idObra(r)), r));
  const delA = [...baseA.keys()].filter(id => id && !nowA.has(id));
  const saveA = [...nowA.values()].filter(r => !baseA.has(idPersoa(r)) || !eqAtt(baseA.get(idPersoa(r)), r));

  await seq(delW, idRepertorio => apps(env,user,'eliminarEnsaioRepertorioPortal',{ idEnsaio:draft.idEnsaio, idRepertorio }));
  await seq(saveW, r => apps(env,user,'gardarEnsaioRepertorioPortal',{
    idEnsaio:draft.idEnsaio, idRepertorio:idObra(r), tipoTraballo:r.tipoTraballo, desde:r.desde, ata:r.ata, observacions:r.observacions
  }));
  await seq(delA, idPersoaValue => apps(env,user,'eliminarAsistenciaEnsaioPortal',{ idEnsaio:draft.idEnsaio, idPersoa:idPersoaValue }));
  await seq(saveA, r => apps(env,user,'gardarAsistenciaEnsaioPortal',{
    idEnsaio:draft.idEnsaio, idPersoa:idPersoa(r), estadoAsistencia:r.estadoAsistencia,
    xustificada:r.xustificada===true, motivo:r.motivo, observacions:r.observacions
  }));

  const fresh = await seedIndex(env, user);
  const synced = await saveDraft(env, draftFromIndex(fresh, draft.idEnsaio));
  return { draft:synced, resumo:{ obrasGardadas:saveW.length, obrasEliminadas:delW.length, asistenciasGardadas:saveA.length, asistenciasEliminadas:delA.length } };
}

export async function onRequest({request, env}) {
  if (request.method !== 'POST') return fail(405,'METHOD_NOT_ALLOWED','Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return fail(500,'MISSING_CONFIG','O servizo non está configurado correctamente.');
  let body;
  try { body = await request.json(); } catch { return fail(400,'INVALID_JSON','Solicitude non válida.'); }
  let user;
  try { user = await firebase(body.idToken, env.FIREBASE_API_KEY); } catch { return fail(503,'FIREBASE_UNAVAILABLE','Non foi posible validar a sesión.'); }
  if (!user) return fail(401,'INVALID_SESSION','A identificación non é válida ou caducou.');

  let permiso;
  try { permiso = await permisoEnsaios(env,user); } catch { return fail(503,'PERMISSION_UNAVAILABLE','Non foi posible comprobar o permiso de Ensaios.'); }
  const accion = clean(body.accion || 'obterXestion');
  const readOnly = accion === 'listar' || accion === 'obterXestion';
  if (readOnly ? permiso?.podeLer !== true : permiso?.podeEscribir !== true) return fail(403,'FORBIDDEN', readOnly ? 'Non tes permiso de lectura en Ensaios.' : 'Non tes permiso de escritura en Ensaios.');

  try {
    if (accion === 'listar') {
      const {index, fonte} = await getIndex(env,user,body.forzar===true);
      return json(200,{ok:true,index,almacen:fonte},{'X-SCPP-Storage':fonte});
    }
    const ensaio = clean(body.idEnsaio);
    if (!ensaio) return fail(400,'INVALID_DATA','Falta identificar o ensaio.');

    if (accion === 'obterXestion') {
      const {index, fonte} = await getIndex(env,user,body.refrescarBase !== false);
      const draft = await getDraft(env,index,ensaio);
      return json(200,{ok:true,draft,indexRevision:index.revision,almacen:fonte},{'X-SCPP-Storage':fonte});
    }

    const {index} = await getIndex(env,user,false);
    let draft = await getDraft(env,index,ensaio);

    if (accion === 'gardarAsistencia') {
      const persoa = clean(body.idPersoa); if (!persoa) return fail(400,'INVALID_DATA','Falta identificar a persoa.');
      const map = new Map(draft.asistencias.map(r => [idPersoa(r),r]));
      map.set(persoa, asistencia({persoa,estadoAsistencia:body.estadoAsistencia,xustificada:body.xustificada,motivo:body.motivo,observacions:body.observacions},ensaio));
      draft = await saveDraft(env,{...draft,dirty:true,asistencias:[...map.values()]});
      return json(200,{ok:true,draft,almacen:'R2'},{'X-SCPP-Storage':'R2-DRAFT'});
    }
    if (accion === 'quitarAsistencia') {
      const persoa = clean(body.idPersoa); if (!persoa) return fail(400,'INVALID_DATA','Falta identificar a persoa.');
      draft = await saveDraft(env,{...draft,dirty:true,asistencias:draft.asistencias.filter(r => idPersoa(r)!==persoa)});
      return json(200,{ok:true,draft,almacen:'R2'},{'X-SCPP-Storage':'R2-DRAFT'});
    }
    if (accion === 'gardarObra') {
      const rid = clean(body.idRepertorio); if (!rid) return fail(400,'INVALID_DATA','Falta identificar a obra.');
      const map = new Map(draft.repertorio.map(r => [idObra(r),r])); const prev = map.get(rid) || {};
      map.set(rid, obra({...prev,repertorio:rid,orde:body.orde||prev.orde||map.size+1,tipoTraballo:body.tipoTraballo??prev.tipoTraballo,desde:body.desde??prev.desde,ata:body.ata??prev.ata,observacions:body.observacions??prev.observacions},ensaio,map.size+1));
      draft = await saveDraft(env,{...draft,dirty:true,repertorio:[...map.values()]});
      return json(200,{ok:true,draft,almacen:'R2'},{'X-SCPP-Storage':'R2-DRAFT'});
    }
    if (accion === 'eliminarObra') {
      const rid = clean(body.idRepertorio); if (!rid) return fail(400,'INVALID_DATA','Falta identificar a obra.');
      draft = await saveDraft(env,{...draft,dirty:true,repertorio:draft.repertorio.filter(r => idObra(r)!==rid)});
      return json(200,{ok:true,draft,almacen:'R2'},{'X-SCPP-Storage':'R2-DRAFT'});
    }
    if (accion === 'incluírProgramaConcerto') {
      const cid = clean(body.idConcerto); if (!cid) return fail(400,'INVALID_DATA','Selecciona un concerto.');
      const c = (index.concertos||[]).find(x => clean(x.id||x.idConcerto)===cid);
      let ids = resolveProgram(c?.programa || c?.repertorio || [], index.repertorio); let fontePrograma='R2';
      if (!ids.length) { const x = await apps(env,user,'obterXestionConcertoAdministracionPortal',{idConcerto:cid}); ids=resolveProgram(x?.programa||[],index.repertorio); fontePrograma='SHEET'; }
      if (!ids.length) return fail(409,'CONCERT_WITHOUT_PROGRAM','O concerto seleccionado non ten obras resolubles no programa.');
      const map = new Map(draft.repertorio.map(r => [idObra(r),r])); let engadidas=0;
      for (const rid of ids.slice(0,80)) { if (map.has(rid)) continue; map.set(rid,obra({repertorio:rid,orde:map.size+1},ensaio,map.size+1)); engadidas+=1; }
      draft = await saveDraft(env,{...draft,dirty:true,repertorio:[...map.values()]});
      return json(200,{ok:true,draft,engadidas,fontePrograma,almacen:'R2'},{'X-SCPP-Storage':'R2-DRAFT'});
    }
    if (accion === 'descartar') {
      const fresh = await seedIndex(env,user); draft = await saveDraft(env,draftFromIndex(fresh,ensaio));
      return json(200,{ok:true,draft,almacen:'SHEET+R2'});
    }
    if (accion === 'finalizar') return json(200,{ok:true,...await finalizar(env,user,draft),almacen:'SHEET+R2'});
    return fail(400,'ACTION_NOT_ALLOWED','Acción non permitida.');
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code==='FORBIDDEN' ? 403 : code==='NOT_FOUND' ? 404 : 502;
    return fail(status,code,error?.message || 'Non foi posible completar a operación.');
  }
}
