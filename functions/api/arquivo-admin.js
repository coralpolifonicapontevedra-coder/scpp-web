import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const MODULO = 'arquivo';
const CACHE_PREFIX = 'arquivo/cache-v1/';
const CACHE_FRESH_MS = 5 * 60 * 1000;
const CACHE_BACKUP_MS = 24 * 60 * 60 * 1000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';

const clean = (value) => String(value || '').trim();
const ramaActual = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const cacheKey = (env) => `${CACHE_PREFIX}${ramaActual(env)}/listado.json`;

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  }
});

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  return user?.email && user.emailVerified === true
    ? { uid: clean(user.localId), email: clean(user.email).toLowerCase() }
    : null;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(clean(email).toLowerCase())
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function administracionLegacyR2(env, user) {
  if (!env.R2_PRIVADO?.get) return false;
  try {
    const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
    if (!object) return false;
    const entry = await object.json().catch(() => null);
    return clean(entry?.administrador).toLowerCase() === user.email
      && clean(entry?.payload?.perfil?.nivel) === 'Administración';
  } catch {
    return false;
  }
}

async function permisoArquivo(env, user, write = false) {
  let permiso = await obterPermisoPortalCacheado(env, user, MODULO);
  if (!permiso) {
    try { permiso = await obterPermisoPortal(env, user, MODULO); }
    catch { permiso = null; }
  }

  if (permiso?.configurado) {
    return write ? permiso?.podeEscribir === true : permiso?.podeLer === true;
  }

  return administracionLegacyR2(env, user);
}

async function lerCache(env) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(cacheKey(env));
    if (!object) return null;
    const entry = await object.json().catch(() => null);
    if (!entry?.payload?.ok) return null;
    const savedAt = Number(entry.savedAt || 0);
    const idadeMs = Date.now() - savedAt;
    if (!savedAt || idadeMs < 0 || idadeMs > CACHE_BACKUP_MS) return null;
    return { payload: entry.payload, idadeMs, fresca: idadeMs <= CACHE_FRESH_MS };
  } catch (error) {
    console.warn('Arquivo: non se puido ler a caché R2:', error);
    return null;
  }
}

async function gardarCache(env, payload) {
  if (!env.R2_PRIVADO?.put || !payload?.ok) return;
  await env.R2_PRIVADO.put(cacheKey(env), JSON.stringify({ savedAt: Date.now(), payload }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo: 'arquivo-admin', version: '1', contorno: ramaActual(env) }
  });
}

async function borrarCache(env) {
  if (!env.R2_PRIVADO?.delete) return;
  await env.R2_PRIVADO.delete(cacheKey(env)).catch(() => {});
}

function payloadAppsScript(body, env, user, accion) {
  const payload = {
    ...body,
    token: env.WEB_WRITE_TOKEN,
    email: user.email,
    actorEmail: user.email,
    uidFirebase: user.uid,
    accion
  };
  delete payload.idToken;
  return payload;
}

async function listarDesdeSheet(env, user) {
  const { resultado } = await obterJsonAppsScript(
    env,
    payloadAppsScript({}, env, user, 'listarArquivoAdministracion'),
    { timeoutMs: 25000, attemptTimeoutMs: 10000 }
  );
  if (!resultado?.ok) {
    const error = new Error(resultado?.erro || 'Non foi posible cargar o arquivo.');
    error.resultado = resultado;
    throw error;
  }
  await gardarCache(env, resultado);
  return resultado;
}

async function refrescarEnSegundoPlano(context, user) {
  try { await listarDesdeSheet(context.env, user); }
  catch (error) { console.warn('Arquivo: non se puido refrescar a caché R2:', error); }
}

async function limparXustificanteSeProcede(env, accion, body, resultado) {
  if (!(resultado?.ok && accion === 'gardarMovementoArquivoAdministracion' && body?.eliminar === true)) return;
  const ruta = clean(resultado.xustificante);
  if (!ruta.startsWith('arquivo/xustificantes/') || !env.R2_PRIVADO?.delete) return;
  try {
    await env.R2_PRIVADO.delete(ruta);
  } catch (error) {
    console.warn('Arquivo: movemento eliminado pero non se puido borrar o xustificante de R2', error);
    resultado.aviso = 'O movemento foi eliminado, pero quedou pendente limpar o xustificante privado.';
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'O servizo de Arquivo non está configurado.' });
  }

  let body;
  try { body = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida.' }); }

  let user;
  try { user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida.' });

  const accion = clean(body?.accion);
  const allowed = new Set([
    'listarArquivoAdministracion',
    'gardarFondoAdministracion',
    'gardarElementoFondoAdministracion',
    'gardarMovementoArquivoAdministracion',
    'gardarElementoMovementoAdministracion',
    'rexistrarDevolucionArquivoAdministracion'
  ]);
  if (!allowed.has(accion)) return json(400, { ok: false, erro: 'Acción non permitida.' });

  const write = accion !== 'listarArquivoAdministracion';
  if (!(await permisoArquivo(env, user, write))) {
    return json(403, {
      ok: false,
      codigo: 'ARQUIVO_PERMISSION_REQUIRED',
      erro: write
        ? 'Non tes permiso de escritura no módulo Arquivo.'
        : 'Non tes permiso de lectura no módulo Arquivo.'
    });
  }

  if (accion === 'listarArquivoAdministracion') {
    const cache = await lerCache(env);
    if (cache?.payload) {
      if (!cache.fresca) {
        const tarefa = refrescarEnSegundoPlano(context, user);
        if (typeof context.waitUntil === 'function') context.waitUntil(tarefa);
      }
      return json(200, {
        ...cache.payload,
        cache: { orixe: 'r2', idadeMs: cache.idadeMs, fresca: cache.fresca }
      }, {
        'X-SCPP-Cache': cache.fresca ? 'HIT' : 'STALE-WHILE-REVALIDATE',
        'X-SCPP-Storage': 'R2'
      });
    }

    try {
      const resultado = await listarDesdeSheet(env, user);
      return json(200, {
        ...resultado,
        cache: { orixe: 'sheet-seed', idadeMs: 0, fresca: true }
      }, {
        'X-SCPP-Cache': 'SEED',
        'X-SCPP-Storage': 'SHEET'
      });
    } catch (error) {
      console.error('Arquivo: erro ao cargar o listado:', error);
      return json(502, { ok: false, erro: 'Non foi posible acceder ao arquivo.' });
    }
  }

  try {
    const { resultado } = await obterJsonAppsScript(
      env,
      payloadAppsScript(body, env, user, accion),
      { timeoutMs: 25000, attemptTimeoutMs: 10000 }
    );

    if (!resultado?.ok) {
      const status = resultado?.codigo === 'ADMIN_REQUIRED' ? 403 : 502;
      return json(status, resultado || { ok: false, erro: 'Resposta baleira.' });
    }

    await limparXustificanteSeProcede(env, accion, body, resultado);
    await borrarCache(env);

    const tarefa = refrescarEnSegundoPlano(context, user);
    if (typeof context.waitUntil === 'function') context.waitUntil(tarefa);
    else await tarefa;

    return json(200, { ...resultado, cacheActualizada: true }, {
      'X-SCPP-Cache': 'INVALIDATED'
    });
  } catch (error) {
    console.error('Arquivo: erro na escritura:', error);
    return json(502, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non foi posible acceder ao arquivo.'
    });
  }
}
