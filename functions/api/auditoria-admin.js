import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const MODULO = 'auditoria';
const CACHE_PREFIX = 'auditoria/cache-v1/';
const CACHE_FRESH_MS = 2 * 60 * 1000;
const CACHE_BACKUP_MS = 24 * 60 * 60 * 1000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';

const clean = (value) => String(value || '').trim();
const ramaActual = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const cacheKey = (env) => `${CACHE_PREFIX}${ramaActual(env)}/actividade.json`;

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
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
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

async function podeLerAuditoria(env, user) {
  let permiso = await obterPermisoPortalCacheado(env, user, MODULO);
  if (!permiso) {
    try { permiso = await obterPermisoPortal(env, user, MODULO); }
    catch { permiso = null; }
  }
  if (permiso?.configurado) return permiso?.podeLer === true;
  return administracionLegacyR2(env, user);
}

async function lerCache(env) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(cacheKey(env));
    if (!object) return null;
    const entry = await object.json().catch(() => null);
    if (!entry?.payload?.ok || !Array.isArray(entry.payload.actividade)) return null;
    const savedAt = Number(entry.savedAt || 0);
    const idadeMs = Date.now() - savedAt;
    if (!savedAt || idadeMs < 0 || idadeMs > CACHE_BACKUP_MS) return null;
    return { payload: entry.payload, idadeMs, fresca: idadeMs <= CACHE_FRESH_MS };
  } catch (error) {
    console.warn('Auditoría: non se puido ler a caché R2:', error);
    return null;
  }
}

async function gardarCache(env, payload) {
  if (!env.R2_PRIVADO?.put || !payload?.ok || !Array.isArray(payload.actividade)) return;
  await env.R2_PRIVADO.put(cacheKey(env), JSON.stringify({ savedAt: Date.now(), payload }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo: 'auditoria-admin', version: '1', contorno: ramaActual(env) }
  });
}

async function listarDesdeSheet(env, user, limite = 1000) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarActividadePortal',
    email: user.email,
    actorEmail: user.email,
    uidFirebase: user.uid,
    limite: Math.min(Math.max(Number(limite) || 1000, 1), 2000)
  }, { timeoutMs: 20000, attemptTimeoutMs: 9000 });

  if (!resultado?.ok) {
    const error = new Error(resultado?.erro || 'Non foi posible cargar a auditoría.');
    error.resultado = resultado;
    throw error;
  }
  await gardarCache(env, resultado);
  return resultado;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'O servizo de auditoría non está configurado.' });
  }

  let body;
  try { body = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida.' }); }

  let user;
  try { user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });

  if (!(await podeLerAuditoria(env, user))) {
    return json(403, { ok: false, codigo: 'AUDITORIA_PERMISSION_REQUIRED', erro: 'Non tes permiso para consultar a auditoría.' });
  }

  const cache = await lerCache(env);
  if (cache?.payload) {
    if (!cache.fresca) {
      const tarefa = listarDesdeSheet(env, user, body?.limite).catch((error) =>
        console.warn('Auditoría: non se puido refrescar a caché R2:', error)
      );
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
    const payload = await listarDesdeSheet(env, user, body?.limite);
    return json(200, {
      ...payload,
      cache: { orixe: 'sheet-seed', idadeMs: 0, fresca: true }
    }, {
      'X-SCPP-Cache': 'SEED',
      'X-SCPP-Storage': 'SHEET'
    });
  } catch (error) {
    console.error('Erro ao cargar Auditoría:', error);
    return json(502, { ok: false, erro: 'Non foi posible cargar a auditoría.' });
  }
}
