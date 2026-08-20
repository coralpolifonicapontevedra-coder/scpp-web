import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 25_000;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_PREFIX = 'concertos/operacion-v1/';
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const ASISTENCIAS_CACHE_KEY = 'indices/asistencias-concertos.json';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    ...headers
  }
});

function erro(status, etapa, codigo, mensaxe) {
  return json(status, { ok:false, etapa, codigo, erro:mensaxe });
}

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal:controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ idToken:token }) },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid:String(user.localId || ''), email:String(user.email).trim().toLowerCase() };
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email || '').trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function verificarAdministracionR2(env, user) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return false;
  const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const entry = await object.json().catch(() => null);
  return entry?.administrador === user.email && entry?.payload?.perfil?.nivel === 'Administración';
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token:env.WEB_WRITE_TOKEN,
    accion,
    email:user.email,
    uidFirebase:user.uid,
    ...datos
  }, { timeoutMs:TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs:10_000 });
  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

function idSeguro(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 160);
}
function cacheKey(idConcerto) { return `${CACHE_PREFIX}${idConcerto}.json`; }

async function lerCache(env, idConcerto) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(cacheKey(idConcerto));
  if (!object) return null;
  const entry = await object.json().catch(() => null);
  if (!entry?.payload?.ok || Number(entry.savedAt || 0) <= 0) return null;
  const idade = Date.now() - Number(entry.savedAt);
  return idade <= CACHE_MS ? { payload:entry.payload, idade } : null;
}

async function gardarCache(env, idConcerto, payload) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function' || !payload?.ok) return;
  await env.R2_PRIVADO.put(cacheKey(idConcerto), JSON.stringify({ savedAt:Date.now(), payload }), {
    httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' }
  });
}

async function invalidar(env, idConcerto, asistencias = false) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.delete !== 'function') return;
  const deletes = [env.R2_PRIVADO.delete(cacheKey(idConcerto))];
  if (asistencias) deletes.push(env.R2_PRIVADO.delete(ASISTENCIAS_CACHE_KEY));
  await Promise.allSettled(deletes);
}

async function listar(context, user, idConcerto, forzar) {
  if (!forzar) {
    const cached = await lerCache(context.env, idConcerto);
    if (cached?.payload) return json(200, { ...cached.payload, cache:'R2' }, {
      'X-SCPP-Cache':'HIT',
      'X-SCPP-Cache-Age':String(Math.round(cached.idade / 1000))
    });
  }
  const inicio = Date.now();
  const payload = await chamarAppsScript(context.env, user, 'listarConcertosAdministracionPortal', {
    operacion:'detalle', idConcerto
  });
  await gardarCache(context.env, idConcerto, payload);
  return json(200, { ...payload, cache:'SHEET-SEED' }, {
    'X-SCPP-Cache':forzar ? 'REFRESH' : 'SEED',
    'Server-Timing':`apps-script;dur=${Date.now() - inicio}`
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
  catch { return erro(503, 'FIREBASE', 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.'); }
  if (!user) return erro(401, 'AUTH', 'INVALID_SESSION', 'A identificación non é válida ou caducou.');
  if (!(await verificarAdministracionR2(env, user))) return erro(403, 'AUTH', 'FORBIDDEN', 'Usuario non autorizado para administrar concertos.');

  const accion = String(body.accion || 'listar').trim();
  const idConcerto = idSeguro(body.idConcerto);
  if (!idConcerto) return erro(400, 'REQUEST', 'INVALID_DATA', 'Falta identificar o concerto.');

  try {
    if (accion === 'listar') return await listar(context, user, idConcerto, body.forzar === true);

    if (accion === 'gardarAsistencias') {
      const idsPersoas = [...new Set((Array.isArray(body.idsPersoas) ? body.idsPersoas : []).map(idSeguro).filter(Boolean))].slice(0, 200);
      const inicio = Date.now();
      const result = await chamarAppsScript(env, user, 'actualizarConcertoAdministracionPortal', {
        operacion:'gardarAsistencias', idConcerto, idsPersoas
      });
      await invalidar(env, idConcerto, true);
      let payload = null;
      try {
        payload = await chamarAppsScript(env, user, 'listarConcertosAdministracionPortal', { operacion:'detalle', idConcerto });
        await gardarCache(env, idConcerto, payload);
      } catch (cacheError) { console.warn('Asistencias gardadas, pero non se puido rexenerar a caché:', cacheError); }
      return json(200, { ok:true, resultado:result.resultado || result, payload, diagnostico:{ duracionMs:Date.now() - inicio } }, { 'X-SCPP-Cache':'INVALIDATED' });
    }

    if (accion === 'gardarPrograma') {
      const programa = (Array.isArray(body.programa) ? body.programa : []).slice(0, 100).map((item) => ({
        idRepertorio:idSeguro(item?.idRepertorio),
        notas:String(item?.notas || '').trim().slice(0, 1000),
        solista:String(item?.solista || '').trim().slice(0, 250)
      })).filter((item) => item.idRepertorio);
      const inicio = Date.now();
      const result = await chamarAppsScript(env, user, 'actualizarConcertoAdministracionPortal', {
        operacion:'gardarPrograma', idConcerto, programa
      });
      await invalidar(env, idConcerto, false);
      let payload = null;
      try {
        payload = await chamarAppsScript(env, user, 'listarConcertosAdministracionPortal', { operacion:'detalle', idConcerto });
        await gardarCache(env, idConcerto, payload);
      } catch (cacheError) { console.warn('Programa gardado, pero non se puido rexenerar a caché:', cacheError); }
      return json(200, { ok:true, resultado:result.resultado || result, payload, diagnostico:{ duracionMs:Date.now() - inicio } }, { 'X-SCPP-Cache':'INVALIDATED' });
    }

    return erro(400, 'REQUEST', 'ACTION_NOT_ALLOWED', 'Acción non permitida.');
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 502;
    return erro(status, 'APPS_SCRIPT', code, error?.message || 'Non foi posible completar a operación.');
  }
}
