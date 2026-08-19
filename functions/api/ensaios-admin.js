import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ENSAIOS_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
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

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
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
  return { uid:String(user.localId || ''), email:String(user.email).trim().toLowerCase() };
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

async function invalidarCacheEnsaios(env) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.list !== 'function') return;
  let cursor;
  do {
    const page = await env.R2_PRIVADO.list({ prefix:ENSAIOS_CACHE_PREFIX, cursor });
    const keys = (page.objects || []).map((item) => item.key);
    if (keys.length) await env.R2_PRIVADO.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return erro(405, 'REQUEST', 'METHOD_NOT_ALLOWED', 'Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return erro(500, 'CONFIG', 'MISSING_CONFIG', 'O servizo non está configurado correctamente.');
  }

  let body;
  try { body = await request.json(); }
  catch { return erro(400, 'REQUEST', 'INVALID_JSON', 'Solicitude non válida.'); }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch {
    return erro(503, 'FIREBASE', 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.');
  }
  if (!user) return erro(401, 'AUTH', 'INVALID_SESSION', 'A identificación non é válida ou caducou.');

  const accion = String(body.accion || 'listar').trim();

  try {
    if (accion === 'listar') {
      const result = await chamarAppsScript(env, user, 'listarEnsaiosAdministracionPortal');
      return json(200, { ok:true, nivel:result.nivel || '', ensaios:Array.isArray(result.ensaios) ? result.ensaios : [] });
    }

    if (accion === 'cambiarData') {
      const idEnsaio = String(body.idEnsaio || '').trim();
      const data = String(body.data || '').trim();
      if (!idEnsaio || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return erro(400, 'REQUEST', 'INVALID_DATA', 'Indica un ensaio e unha data válida.');
      }
      const result = await chamarAppsScript(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio, data, cancelado:false });
      await invalidarCacheEnsaios(env);
      return json(200, { ok:true, resultado:result.resultado || result });
    }

    if (accion === 'darBaixa') {
      const idEnsaio = String(body.idEnsaio || '').trim();
      if (!idEnsaio) return erro(400, 'REQUEST', 'INVALID_DATA', 'Falta o ensaio que se quere dar de baixa.');
      const result = await chamarAppsScript(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio, cancelado:true });
      await invalidarCacheEnsaios(env);
      return json(200, { ok:true, resultado:result.resultado || result });
    }

    return erro(400, 'REQUEST', 'ACTION_NOT_ALLOWED', 'Acción non permitida.');
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 502;
    return erro(status, 'APPS_SCRIPT', code, error?.message || 'Non foi posible completar a operación.');
  }
}
