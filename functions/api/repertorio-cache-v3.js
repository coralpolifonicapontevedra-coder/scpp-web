import { construirCatalogo, onRequest as onRequestV2 } from './repertorio-cache-v2.js';

const CATALOGO_KEY_MAIN = 'repertorio/cache/catalogo.json';
const CATALOGO_KEY_PREVIEW = 'repertorio/cache/preview/catalogo.json';
const ADMIN_KEY_MAIN = 'repertorio/cache/administracion/main/listado-v2.json';
const ADMIN_KEY_PREVIEW = 'repertorio/cache/administracion/preview/listado-v2.json';
const CONCERTOS_KEY_MAIN = 'indices/concertos-privado-v1.json';
const CONCERTOS_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const CACHE_FRESH_MS = 60 * 1000;
const FIREBASE_TIMEOUT_MS = 8_000;
const VERSION = 'repertorio-cache-v3-admin-authority';

const clean = (value = '') => String(value ?? '').trim();

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

function ramaActual(env) {
  return clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
}

function catalogoKey(env) {
  return ramaActual(env) === 'main' ? CATALOGO_KEY_MAIN : CATALOGO_KEY_PREVIEW;
}

function adminKey(env) {
  return ramaActual(env) === 'main' ? ADMIN_KEY_MAIN : ADMIN_KEY_PREVIEW;
}

function concertosKey(env) {
  return ramaActual(env) === 'main' ? CONCERTOS_KEY_MAIN : CONCERTOS_KEY_PREVIEW;
}

async function fetchConTempoLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetchConTempoLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    FIREBASE_TIMEOUT_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function writeJson(bucket, key, value) {
  if (!bucket?.put) return;
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
}

function catalogoValido(value) {
  return value?.ok === true && Array.isArray(value?.obras);
}

function adminValido(value) {
  const payload = value?.payload;
  return payload?.ok === true &&
    Array.isArray(payload?.obras) &&
    Array.isArray(payload?.partituras) &&
    Array.isArray(payload?.audios);
}

async function respostaV2EnSegundoPlano(context) {
  const request = context.request.clone();
  const response = await onRequestV2({ request, env: context.env });
  try { await response.arrayBuffer(); } catch {}
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo de Repertorio non está configurado correctamente.' });
  }

  const requestParaV2 = request.clone();
  const body = await request.json().catch(() => null);
  if (!body || clean(body.accion || 'listarRepertorioPortal') !== 'listarRepertorioPortal') {
    return json(400, { ok: false, erro: 'Acción non permitida nesta ruta.' });
  }

  const user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  const inicio = Date.now();
  const [catalogo, admin, concertos] = await Promise.all([
    readJson(env.R2_PRIVADO, catalogoKey(env)),
    readJson(env.R2_PRIVADO, adminKey(env)),
    readJson(env.R2_PRIVADO, concertosKey(env))
  ]);

  const catalogoSavedAt = Number(catalogo?.cacheMeta?.savedAt || 0);
  const adminSavedAt = Number(admin?.gardadoEn || 0);

  if (adminValido(admin) && (!catalogoValido(catalogo) || adminSavedAt > catalogoSavedAt)) {
    const actualizado = construirCatalogo(admin.payload, concertos, catalogo);
    actualizado.cacheMeta = {
      savedAt: adminSavedAt || Date.now(),
      source: 'R2-ADMIN-SNAPSHOT',
      branch: ramaActual(env),
      version: VERSION
    };
    await writeJson(env.R2_PRIVADO, catalogoKey(env), actualizado);
    return json(200, actualizado, {
      'X-SCPP-Repertorio': 'R2-ADMIN-SNAPSHOT',
      'X-SCPP-Repertorio-Source': 'R2-ADMIN-SNAPSHOT',
      'Server-Timing': `r2;dur=${Date.now() - inicio}`
    });
  }

  if (catalogoValido(catalogo)) {
    const idade = catalogoSavedAt > 0 ? Date.now() - catalogoSavedAt : Number.POSITIVE_INFINITY;
    if (idade > CACHE_FRESH_MS && typeof waitUntil === 'function') {
      waitUntil(respostaV2EnSegundoPlano({ request: requestParaV2, env }).catch((error) => {
        console.error('Non se puido revalidar Repertorio en segundo plano:', error);
      }));
    }
    return json(200, catalogo, {
      'X-SCPP-Repertorio': idade <= CACHE_FRESH_MS ? 'R2-CACHE' : 'R2-STALE-WHILE-REVALIDATE',
      'X-SCPP-Repertorio-Source': clean(catalogo?.cacheMeta?.source) || 'R2',
      'Server-Timing': `r2;dur=${Date.now() - inicio}`
    });
  }

  return onRequestV2({ request: requestParaV2, env });
}
