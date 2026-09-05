import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const CACHE_MEMORIA_MS = 10 * 60 * 1000;
const CACHE_TOKEN_MS = 10 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const R2_BASE = 'ensaios/cache-v3/';
const CONCERTOS_PRIVATE_INDEX_KEY = 'indices/concertos-privado-v1.json';
const CONCERTOS_PRIVATE_INDEX_PREVIEW_KEY = 'indices/preview/concertos-privado-v1.json';

const cacheTokens = new Map();
const cacheMemoria = new Map();

const clean = (value) => String(value || '').trim();
const rama = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const r2Prefix = (env) => `${R2_BASE}${rama(env)}/usuarios/`;
const versionKey = (env) => `${R2_BASE}${rama(env)}/version.json`;
const concertIndexKey = (env) => rama(env) === 'main' ? CONCERTOS_PRIVATE_INDEX_KEY : CONCERTOS_PRIVATE_INDEX_PREVIEW_KEY;

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options':'nosniff',
    ...extra
  }
});

function erro(status, etapa, codigo, mensaxe) {
  return json(status, { ok:false, etapa, codigo, erro:mensaxe });
}

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, redirect:'follow', signal:controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function limparMap(cache, maximo = 100) {
  const agora = Date.now();
  for (const [clave, entrada] of cache.entries()) {
    if (!entrada || Number(entrada.expira || 0) <= agora) cache.delete(clave);
  }
  while (cache.size > maximo) cache.delete(cache.keys().next().value);
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const cached = cacheTokens.get(token);
  if (cached?.expira > Date.now()) return cached.usuario;

  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ idToken:token })
    },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  const usuario = { uid:clean(user.localId), email:clean(user.email).toLowerCase() };
  cacheTokens.set(token, { usuario, expira:Date.now() + CACHE_TOKEN_MS });
  limparMap(cacheTokens);
  return usuario;
}

async function permisoEnsaios(env, user) {
  let permiso = await obterPermisoPortalCacheado(env, user, 'ensaios');
  if (!permiso) permiso = await obterPermisoPortal(env, user, 'ensaios');
  return permiso;
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token:env.WEB_WRITE_TOKEN,
    accion,
    email:user.email,
    uidFirebase:user.uid,
    ...datos
  }, {
    timeoutMs:TIMEOUT_APPS_SCRIPT_MS,
    attemptTimeoutMs:8_000
  });

  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function r2Key(env, user) {
  return `${r2Prefix(env)}${await hashEmail(user.email)}.json`;
}

function payloadValido(payload) {
  return payload?.ok === true && payload?.version === 2 && Array.isArray(payload.ensaios) && Array.isArray(payload.persoas);
}

async function lerVersion(env) {
  if (!env.R2_PRIVADO?.get) return 1;
  try {
    const object = await env.R2_PRIVADO.get(versionKey(env));
    if (!object) return 1;
    const data = await object.json().catch(() => null);
    const value = Number(data?.version || 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  } catch (error) {
    console.warn('Non se puido ler a versión global de Ensaios:', error);
    return 1;
  }
}

async function incrementarVersion(env) {
  if (!env.R2_PRIVADO?.put) return Date.now();
  const current = await lerVersion(env);
  const next = Math.max(current + 1, Date.now());
  await env.R2_PRIVADO.put(versionKey(env), JSON.stringify({
    version:next,
    updatedAt:new Date().toISOString()
  }), {
    httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' },
    customMetadata:{ tipo:'ensaios-version-global', version:'1', contorno:rama(env) }
  });
  return next;
}

function normalizar(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

async function lerConcertosPrivados(env, repertorio = []) {
  if (!env.R2_PRIVADO?.get) return [];
  try {
    let object = await env.R2_PRIVADO.get(concertIndexKey(env));
    if (!object && rama(env) !== 'main') object = await env.R2_PRIVADO.get(CONCERTOS_PRIVATE_INDEX_KEY);
    if (!object) return [];
    const index = await object.json();
    if (index?.ok !== true || !Array.isArray(index.concertos)) return [];

    const porTitulo = new Map();
    repertorio.forEach((obra) => {
      const id = clean(obra.idRepertorio || obra.id);
      const titulo = normalizar(obra.nomeObra || obra.nome || '');
      if (id && titulo && !porTitulo.has(titulo)) porTitulo.set(titulo, id);
    });

    return index.concertos.map((concerto) => ({
      id:clean(concerto.id),
      nome:clean(concerto.nome),
      data:clean(concerto.data),
      programa:(Array.isArray(concerto.programa) ? concerto.programa : []).map((item) => ({
        idRepertorio:clean(item.idRepertorio || porTitulo.get(normalizar(item.obra))),
        orde:Number(item.orde || 999),
        obra:clean(item.obra),
        autor:clean(item.autor)
      })).filter((item) => item.obra)
    })).filter((concerto) => concerto.id);
  } catch (error) {
    console.warn('Non se puido ler o índice privado de concertos para Ensaios:', error);
    return [];
  }
}

function resolverIdsPrograma(programa, repertorio = []) {
  const validos = new Set();
  const porTitulo = new Map();
  for (const obra of repertorio) {
    const id = clean(obra?.idRepertorio || obra?.id);
    if (!id) continue;
    validos.add(id);
    const titulo = normalizar(obra?.nomeObra || obra?.nome || obra?.obra || obra?.titulo || '');
    if (titulo && !porTitulo.has(titulo)) porTitulo.set(titulo, id);
  }

  const ids = [];
  for (const item of Array.isArray(programa) ? programa : []) {
    const directo = clean(item?.idRepertorio || item?.obraId || item?.repertorio || item?.id);
    if (directo && validos.has(directo)) {
      ids.push(directo);
      continue;
    }
    const titulo = normalizar(item?.obra || item?.titulo || item?.nomeObra || item?.nome || '');
    const idTitulo = titulo ? porTitulo.get(titulo) : '';
    if (idTitulo) ids.push(idTitulo);
  }
  return [...new Set(ids.filter(Boolean))];
}

async function idsProgramaConcerto(env, user, idConcerto, repertorio = []) {
  if (!idConcerto) return [];
  const concertos = await lerConcertosPrivados(env, repertorio);
  const concerto = concertos.find((item) => clean(item.id) === idConcerto);
  let ids = resolverIdsPrograma(concerto?.programa, repertorio);
  if (ids.length) return ids;

  try {
    const xestion = await chamarAppsScript(env, user, 'obterXestionConcertoAdministracionPortal', { idConcerto });
    ids = resolverIdsPrograma(xestion?.programa, repertorio);
  } catch (error) {
    console.warn('Non se puido obter o programa do concerto desde Apps Script:', error);
  }
  return ids;
}

async function crearPayload(env, result) {
  const repertorio = Array.isArray(result.repertorio) ? result.repertorio : [];
  return {
    ok:true,
    version:2,
    perfil:result.perfil || {},
    ensaios:Array.isArray(result.ensaios) ? result.ensaios : [],
    persoas:Array.isArray(result.persoas) ? result.persoas : [],
    asistencias:Array.isArray(result.asistencias) ? result.asistencias : [],
    ensaiosRepertorio:Array.isArray(result.ensaiosRepertorio) ? result.ensaiosRepertorio : [],
    repertorio,
    concertos:await lerConcertosPrivados(env, repertorio),
    seguimento:result.seguimento || {},
    xeradoEn:new Date().toISOString()
  };
}

async function lerR2(env, user, versionActual) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(await r2Key(env, user));
    if (!object) return null;
    const entry = await object.json();
    if (entry?.email !== user.email || Number(entry?.versionGlobal || 0) !== Number(versionActual) || !payloadValido(entry?.payload)) return null;
    return { ...entry, idade:Date.now() - Number(entry.savedAt || 0) };
  } catch (error) {
    console.warn('Non se puido ler o índice de Ensaios desde R2:', error);
    return null;
  }
}

async function gardarR2(env, user, payload, versionGlobal) {
  if (!payloadValido(payload) || !env.R2_PRIVADO?.put) return;
  const savedAt = Date.now();
  await env.R2_PRIVADO.put(await r2Key(env, user), JSON.stringify({
    savedAt,
    versionGlobal,
    email:user.email,
    payload
  }), {
    httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' },
    customMetadata:{ tipo:'ensaios-usuario', version:'3', contorno:rama(env) }
  });
}

function cacheKey(env, user) { return `${rama(env)}::${user.email}`; }

async function lerCache(env, user) {
  const versionActual = await lerVersion(env);
  const key = cacheKey(env, user);
  const memory = cacheMemoria.get(key);
  if (memory && memory.expira > Date.now() && Number(memory.versionGlobal) === Number(versionActual)) {
    return { payload:memory.payload, fonte:'MEMORIA', idade:Date.now() - memory.savedAt };
  }
  if (memory) cacheMemoria.delete(key);

  const r2 = await lerR2(env, user, versionActual);
  if (!r2) return null;
  return { payload:r2.payload, fonte:'R2', idade:r2.idade };
}

async function gardarCache(env, user, payload) {
  const now = Date.now();
  const versionGlobal = await lerVersion(env);
  cacheMemoria.set(cacheKey(env, user), { savedAt:now, expira:now + CACHE_MEMORIA_MS, versionGlobal, payload });
  limparMap(cacheMemoria, 50);
  await gardarR2(env, user, payload, versionGlobal);
}

async function invalidarCacheUsuario(env, user) {
  cacheMemoria.delete(cacheKey(env, user));
  if (env.R2_PRIVADO?.delete) {
    try { await env.R2_PRIVADO.delete(await r2Key(env, user)); }
    catch (error) { console.warn('Non se puido invalidar o índice de Ensaios do usuario en R2:', error); }
  }
}

async function invalidarCachesEnsaios(env, user) {
  await incrementarVersion(env);
  await invalidarCacheUsuario(env, user);
}

function conDiagnostico(payload, fonte) {
  return {
    ...payload,
    diagnostico:{
      ...(payload.diagnostico || {}),
      fonte,
      xeradoEn:payload.diagnostico?.xeradoEn || payload.xeradoEn || new Date().toISOString()
    }
  };
}

async function listar(context, user, forzar = false) {
  if (!forzar) {
    const cached = await lerCache(context.env, user);
    if (cached?.payload) {
      return json(200, conDiagnostico(cached.payload, cached.fonte), {
        'X-SCPP-Cache':'HIT',
        'X-SCPP-Storage':cached.fonte,
        'Server-Timing':'apps-script;dur=0'
      });
    }
  }

  const inicio = Date.now();
  const result = await chamarAppsScript(context.env, user, 'listarEnsaiosPortal');
  const payload = await crearPayload(context.env, result);
  await gardarCache(context.env, user, payload);
  return json(200, conDiagnostico(payload, 'SHEET-SEED'), {
    'X-SCPP-Cache':forzar ? 'REFRESH' : 'SEED',
    'X-SCPP-Storage':'SHEET',
    'Server-Timing':`apps-script;dur=${Date.now() - inicio}`
  });
}

async function rexenerarCache(context, user) {
  const fresh = await chamarAppsScript(context.env, user, 'listarEnsaiosPortal');
  const payload = await crearPayload(context.env, fresh);
  await gardarCache(context.env, user, payload);
  return payload;
}

async function escribir(context, user, accion, datos) {
  const inicio = Date.now();
  const result = await chamarAppsScript(context.env, user, accion, datos);
  await invalidarCachesEnsaios(context.env, user);
  try { await rexenerarCache(context, user); }
  catch (error) { console.warn('A escritura completouse, pero non se puido rexenerar o índice de Ensaios:', error); }
  return json(200, { ok:true, resultado:result.resultado || result, diagnostico:{ fonte:'SHEET-WRITE', duracionMs:Date.now() - inicio } }, {
    'X-SCPP-Cache':'INVALIDATED-GLOBAL',
    'X-SCPP-Storage':'SHEET'
  });
}

async function gardarEnsaioConPrograma(context, user, body) {
  const inicio = Date.now();
  const idConcerto = clean(body.concerto);
  const result = await chamarAppsScript(context.env, user, 'gardarEnsaioPortal', {
    data:clean(body.data),
    horaInicio:clean(body.horaInicio),
    horaFin:clean(body.horaFin),
    lugar:clean(body.lugar),
    tipoEnsaio:clean(body.tipoEnsaio),
    concerto:idConcerto,
    descricion:clean(body.descricion),
    observacions:clean(body.observacions),
    cancelado:body.cancelado === true
  });
  const resultado = result.resultado || result;
  const idEnsaio = clean(resultado?.idEnsaio);
  let obrasPrograma = 0;
  let avisoPrograma = '';

  if (idConcerto && idEnsaio) {
    try {
      const cached = await lerCache(context.env, user);
      let repertorio = Array.isArray(cached?.payload?.repertorio) ? cached.payload.repertorio : [];
      if (!repertorio.length) {
        const fresh = await chamarAppsScript(context.env, user, 'listarEnsaiosPortal');
        repertorio = Array.isArray(fresh?.repertorio) ? fresh.repertorio : [];
      }
      const ids = await idsProgramaConcerto(context.env, user, idConcerto, repertorio);
      for (const idRepertorio of ids.slice(0, 80)) {
        await chamarAppsScript(context.env, user, 'gardarEnsaioRepertorioPortal', {
          idEnsaio,
          idRepertorio,
          tipoTraballo:'',
          desde:'',
          ata:'',
          observacions:''
        });
        obrasPrograma += 1;
      }
      if (!ids.length) avisoPrograma = 'O ensaio creouse, pero o concerto seleccionado non ten obras resolubles no programa.';
    } catch (error) {
      console.error('O ensaio creouse, pero fallou a carga automática do programa:', error);
      avisoPrograma = 'O ensaio creouse, pero non foi posible cargar automaticamente o programa do concerto.';
    }
  }

  await invalidarCachesEnsaios(context.env, user);
  try { await rexenerarCache(context, user); }
  catch (error) { console.warn('O ensaio creouse, pero non se puido rexenerar o índice de Ensaios:', error); }

  return json(200, {
    ok:true,
    resultado:{ ...resultado, obrasPrograma, avisoPrograma },
    diagnostico:{ fonte:'SHEET-WRITE', duracionMs:Date.now() - inicio }
  }, {
    'X-SCPP-Cache':'INVALIDATED-GLOBAL',
    'X-SCPP-Storage':'SHEET'
  });
}

async function incluirPrograma(context, user, body) {
  const idEnsaio = clean(body.idEnsaio);
  const ids = [...new Set((Array.isArray(body.idsRepertorio) ? body.idsRepertorio : []).map(clean).filter(Boolean))].slice(0, 40);
  if (!idEnsaio || !ids.length) return erro(400, 'REQUEST', 'INVALID_DATA', 'Non hai obras do programa para incluír.');

  const inicio = Date.now();
  let engadidas = 0;
  for (const idRepertorio of ids) {
    await chamarAppsScript(context.env, user, 'gardarEnsaioRepertorioPortal', {
      idEnsaio,
      idRepertorio,
      tipoTraballo:'',
      desde:'',
      ata:'',
      observacions:''
    });
    engadidas += 1;
  }
  await invalidarCachesEnsaios(context.env, user);
  let payload = null;
  try { payload = await rexenerarCache(context, user); }
  catch (error) { console.warn('Programa incluído, pero non se puido rexenerar o índice:', error); }
  return json(200, { ok:true, engadidas, payload, diagnostico:{ fonte:'SHEET-WRITE', duracionMs:Date.now() - inicio } }, {
    'X-SCPP-Cache':'INVALIDATED-GLOBAL',
    'X-SCPP-Storage':'SHEET'
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return erro(405, 'REQUEST', 'METHOD_NOT_ALLOWED', 'Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return erro(500, 'CONFIG', 'MISSING_CONFIG', 'O servizo non está configurado correctamente.');

  let body;
  try { body = await request.json(); }
  catch { return erro(400, 'REQUEST', 'INVALID_JSON', 'Solicitude non válida.'); }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch (error) {
    console.error('Erro ao validar Firebase en Ensaios:', error);
    return erro(503, 'FIREBASE', 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.');
  }
  if (!user) return erro(401, 'AUTH', 'INVALID_SESSION', 'A identificación non é válida ou caducou.');

  const accion = clean(body.accion || 'listarEnsaiosPortal');
  const permitidas = new Set(['listarEnsaiosPortal', 'gardarEnsaio', 'gardarAsistenciaEnsaio', 'gardarEnsaioRepertorio', 'incluírProgramaEnsaio', 'obterSeguimentoEnsaios']);
  if (!permitidas.has(accion)) return erro(400, 'REQUEST', 'ACTION_NOT_ALLOWED', 'Acción non permitida.');

  let permiso;
  try { permiso = await permisoEnsaios(env, user); }
  catch (error) {
    console.error('Erro ao resolver o permiso de Ensaios:', error);
    return erro(503, 'PERMISOS', 'PERMISSION_UNAVAILABLE', 'Non foi posible comprobar o permiso de Ensaios.');
  }

  const lectura = accion === 'listarEnsaiosPortal' || accion === 'obterSeguimentoEnsaios';
  if (lectura && !permiso?.podeLer) return erro(403, 'PERMISOS', 'FORBIDDEN', 'Non tes permiso de lectura no módulo Ensaios.');
  if (!lectura && !permiso?.podeEscribir) return erro(403, 'PERMISOS', 'FORBIDDEN', 'Non tes permiso de escritura no módulo Ensaios.');

  try {
    if (accion === 'listarEnsaiosPortal') return await listar(context, user, body.forzar === true);
    if (accion === 'gardarEnsaio') return await gardarEnsaioConPrograma(context, user, body);
    if (accion === 'gardarAsistenciaEnsaio') {
      return await escribir(context, user, 'gardarAsistenciaEnsaioPortal', {
        idEnsaio:clean(body.idEnsaio),
        idPersoa:clean(body.idPersoa),
        estadoAsistencia:clean(body.estadoAsistencia),
        xustificada:body.xustificada === true,
        motivo:clean(body.motivo),
        observacions:clean(body.observacions)
      });
    }
    if (accion === 'gardarEnsaioRepertorio') {
      return await escribir(context, user, 'gardarEnsaioRepertorioPortal', {
        idEnsaio:clean(body.idEnsaio),
        idRepertorio:clean(body.idRepertorio),
        tipoTraballo:clean(body.tipoTraballo),
        desde:clean(body.desde),
        ata:clean(body.ata),
        observacions:clean(body.observacions)
      });
    }
    if (accion === 'incluírProgramaEnsaio') return await incluirPrograma(context, user, body);

    const result = await chamarAppsScript(env, user, 'obterSeguimentoEnsaiosPortal', {
      desde:clean(body.desde),
      ata:clean(body.ata),
      concerto:clean(body.concerto),
      voz:clean(body.voz)
    });
    return json(200, { ok:true, seguimento:result.seguimento || {} }, { 'X-SCPP-Cache':'NO-STORE' });
  } catch (error) {
    console.error('Erro no módulo Ensaios:', error);
    if (error?.code === 'FORBIDDEN') return erro(403, 'PERMISOS', 'FORBIDDEN', 'Non tes permisos para realizar esta operación.');
    if (error?.name === 'AbortError') return erro(504, 'APPS_SCRIPT', 'TIMEOUT', 'O servizo de datos tardou demasiado en responder.');
    const code = error?.code || 'UNAVAILABLE';
    const stage = code.startsWith('APPS_SCRIPT') ? 'APPS_SCRIPT' : 'APPS_SCRIPT_RESULT';
    return erro(503, stage, code, error instanceof Error ? error.message : 'Non foi posible completar a operación.');
  }
}
