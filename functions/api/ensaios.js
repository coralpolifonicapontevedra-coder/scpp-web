import { obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_MEMORIA_MS = 10 * 60 * 1000;
const CACHE_TOKEN_MS = 10 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const R2_PREFIX = 'ensaios/cache-v2/usuarios/';
const CONCERTOS_PRIVATE_INDEX_KEY = 'indices/concertos-privado-v1.json';

const cacheTokens = new Map();
const cacheMemoria = new Map();

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
  const token = String(idToken || '').trim();
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
  const usuario = { uid:String(user.localId || ''), email:String(user.email).trim().toLowerCase() };
  cacheTokens.set(token, { usuario, expira:Date.now() + CACHE_TOKEN_MS });
  limparMap(cacheTokens);
  return usuario;
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
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email || '').trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function r2Key(user) {
  return `${R2_PREFIX}${await hashEmail(user.email)}.json`;
}

function payloadValido(payload) {
  return payload?.ok === true && payload?.version === 2 && Array.isArray(payload.ensaios) && Array.isArray(payload.persoas);
}

function normalizar(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

async function lerConcertosPrivados(env, repertorio = []) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return [];
  try {
    const object = await env.R2_PRIVADO.get(CONCERTOS_PRIVATE_INDEX_KEY);
    if (!object) return [];
    const index = await object.json();
    if (index?.ok !== true || !Array.isArray(index.concertos)) return [];

    const porTitulo = new Map();
    repertorio.forEach((obra) => {
      const id = String(obra.idRepertorio || obra.id || '').trim();
      const titulo = normalizar(obra.nomeObra || obra.nome || '');
      if (id && titulo && !porTitulo.has(titulo)) porTitulo.set(titulo, id);
    });

    return index.concertos.map((concerto) => ({
      id:String(concerto.id || '').trim(),
      nome:String(concerto.nome || '').trim(),
      data:String(concerto.data || '').trim(),
      programa:(Array.isArray(concerto.programa) ? concerto.programa : []).map((item) => ({
        idRepertorio:String(item.idRepertorio || porTitulo.get(normalizar(item.obra)) || '').trim(),
        orde:Number(item.orde || 999),
        obra:String(item.obra || '').trim(),
        autor:String(item.autor || '').trim()
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
    const id = String(obra?.idRepertorio || obra?.id || '').trim();
    if (!id) continue;
    validos.add(id);
    const titulo = normalizar(obra?.nomeObra || obra?.nome || obra?.obra || obra?.titulo || '');
    if (titulo && !porTitulo.has(titulo)) porTitulo.set(titulo, id);
  }

  const ids = [];
  for (const item of Array.isArray(programa) ? programa : []) {
    const directo = String(item?.idRepertorio || item?.obraId || item?.repertorio || item?.id || '').trim();
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
  const concerto = concertos.find((item) => String(item.id || '').trim() === idConcerto);
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

async function lerR2(env, user) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  try {
    const object = await env.R2_PRIVADO.get(await r2Key(user));
    if (!object) return null;
    const entry = await object.json();
    if (entry?.email !== user.email || !payloadValido(entry?.payload)) return null;
    return { ...entry, idade:Date.now() - Number(entry.savedAt || 0) };
  } catch (error) {
    console.warn('Non se puido ler o índice de Ensaios desde R2:', error);
    return null;
  }
}

async function gardarR2(env, user, payload) {
  if (!payloadValido(payload) || !env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return;
  const savedAt = Date.now();
  await env.R2_PRIVADO.put(await r2Key(user), JSON.stringify({ savedAt, email:user.email, payload }), {
    httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' }
  });
}

function cacheKey(user) { return user.email; }

async function lerCache(env, user) {
  const key = cacheKey(user);
  const memory = cacheMemoria.get(key);
  if (memory && memory.expira > Date.now()) {
    return { payload:memory.payload, fonte:'MEMORIA', idade:Date.now() - memory.savedAt };
  }
  const r2 = await lerR2(env, user);
  if (!r2) return null;
  return { payload:r2.payload, fonte:'R2', idade:r2.idade };
}

async function gardarCache(env, user, payload) {
  const now = Date.now();
  cacheMemoria.set(cacheKey(user), { savedAt:now, expira:now + CACHE_MEMORIA_MS, payload });
  limparMap(cacheMemoria, 50);
  await gardarR2(env, user, payload);
}

async function invalidarCache(env, user) {
  cacheMemoria.delete(cacheKey(user));
  if (env.R2_PRIVADO && typeof env.R2_PRIVADO.delete === 'function') {
    try { await env.R2_PRIVADO.delete(await r2Key(user)); }
    catch (error) { console.warn('Non se puido invalidar o índice de Ensaios en R2:', error); }
  }
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
  await invalidarCache(context.env, user);
  try { await rexenerarCache(context, user); }
  catch (error) { console.warn('A escritura completouse, pero non se puido rexenerar o índice de Ensaios:', error); }
  return json(200, { ok:true, resultado:result.resultado || result, diagnostico:{ fonte:'SHEET-WRITE', duracionMs:Date.now() - inicio } }, {
    'X-SCPP-Cache':'INVALIDATED',
    'X-SCPP-Storage':'SHEET'
  });
}

async function gardarEnsaioConPrograma(context, user, body) {
  const inicio = Date.now();
  const idConcerto = String(body.concerto || '').trim();
  const result = await chamarAppsScript(context.env, user, 'gardarEnsaioPortal', {
    data:String(body.data || '').trim(),
    horaInicio:String(body.horaInicio || '').trim(),
    horaFin:String(body.horaFin || '').trim(),
    lugar:String(body.lugar || '').trim(),
    tipoEnsaio:String(body.tipoEnsaio || '').trim(),
    concerto:idConcerto,
    descricion:String(body.descricion || '').trim(),
    observacions:String(body.observacions || '').trim(),
    cancelado:body.cancelado === true
  });
  const resultado = result.resultado || result;
  const idEnsaio = String(resultado?.idEnsaio || '').trim();
  let obrasPrograma = 0;
  let avisoPrograma = '';

  if (idConcerto && idEnsaio) {
    try {
      const fresh = await chamarAppsScript(context.env, user, 'listarEnsaiosPortal');
      const repertorio = Array.isArray(fresh?.repertorio) ? fresh.repertorio : [];
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

  await invalidarCache(context.env, user);
  try { await rexenerarCache(context, user); }
  catch (error) { console.warn('O ensaio creouse, pero non se puido rexenerar o índice de Ensaios:', error); }

  return json(200, {
    ok:true,
    resultado:{ ...resultado, obrasPrograma, avisoPrograma },
    diagnostico:{ fonte:'SHEET-WRITE', duracionMs:Date.now() - inicio }
  }, {
    'X-SCPP-Cache':'INVALIDATED',
    'X-SCPP-Storage':'SHEET'
  });
}

async function incluirPrograma(context, user, body) {
  const idEnsaio = String(body.idEnsaio || '').trim();
  const ids = [...new Set((Array.isArray(body.idsRepertorio) ? body.idsRepertorio : []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 40);
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
  await invalidarCache(context.env, user);
  let payload = null;
  try { payload = await rexenerarCache(context, user); }
  catch (error) { console.warn('Programa incluído, pero non se puido rexenerar o índice:', error); }
  return json(200, { ok:true, engadidas, payload, diagnostico:{ fonte:'SHEET-WRITE', duracionMs:Date.now() - inicio } }, {
    'X-SCPP-Cache':'INVALIDATED',
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

  const accion = String(body.accion || 'listarEnsaiosPortal').trim();
  const permitidas = new Set(['listarEnsaiosPortal', 'gardarEnsaio', 'gardarAsistenciaEnsaio', 'gardarEnsaioRepertorio', 'incluírProgramaEnsaio', 'obterSeguimentoEnsaios']);
  if (!permitidas.has(accion)) return erro(400, 'REQUEST', 'ACTION_NOT_ALLOWED', 'Acción non permitida.');

  try {
    if (accion === 'listarEnsaiosPortal') return await listar(context, user, body.forzar === true);
    if (accion === 'gardarEnsaio') return await gardarEnsaioConPrograma(context, user, body);
    if (accion === 'gardarAsistenciaEnsaio') {
      return await escribir(context, user, 'gardarAsistenciaEnsaioPortal', {
        idEnsaio:String(body.idEnsaio || '').trim(),
        idPersoa:String(body.idPersoa || '').trim(),
        estadoAsistencia:String(body.estadoAsistencia || '').trim(),
        xustificada:body.xustificada === true,
        motivo:String(body.motivo || '').trim(),
        observacions:String(body.observacions || '').trim()
      });
    }
    if (accion === 'gardarEnsaioRepertorio') {
      return await escribir(context, user, 'gardarEnsaioRepertorioPortal', {
        idEnsaio:String(body.idEnsaio || '').trim(),
        idRepertorio:String(body.idRepertorio || '').trim(),
        tipoTraballo:String(body.tipoTraballo || '').trim(),
        desde:String(body.desde || '').trim(),
        ata:String(body.ata || '').trim(),
        observacions:String(body.observacions || '').trim()
      });
    }
    if (accion === 'incluírProgramaEnsaio') return await incluirPrograma(context, user, body);

    const result = await chamarAppsScript(env, user, 'obterSeguimentoEnsaiosPortal', {
      desde:String(body.desde || '').trim(),
      ata:String(body.ata || '').trim(),
      concerto:String(body.concerto || '').trim(),
      voz:String(body.voz || '').trim()
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
