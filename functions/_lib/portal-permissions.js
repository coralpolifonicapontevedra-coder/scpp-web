import { obterJsonAppsScript } from './apps-script.js';

const CACHE_MS = 2 * 60 * 1000;
const R2_PREFIX = 'permisos/cache-v1/';
const cache = new Map();
const niveisValidos = new Set(['sen_acceso', 'lectura', 'escritura', 'administracion']);

const clean = (value) => String(value || '').trim();

function normalizarNivel(value) {
  const nivel = clean(value).toLowerCase();
  return niveisValidos.has(nivel) ? nivel : 'sen_acceso';
}

function claveMemoria(user, modulo) {
  return `${clean(user?.email).toLowerCase()}::${clean(modulo).toLowerCase()}`;
}

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function claveR2(user, modulo) {
  return `${R2_PREFIX}${await hash(`${clean(user?.email).toLowerCase()}::${clean(modulo).toLowerCase()}`)}.json`;
}

function lerMemoria(user, modulo) {
  const key = claveMemoria(user, modulo);
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.value;
}

function gardarMemoria(user, modulo, value) {
  cache.set(claveMemoria(user, modulo), { value, expiresAt: Date.now() + CACHE_MS });
  while (cache.size > 100) cache.delete(cache.keys().next().value);
}

async function lerR2(env, user, modulo) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(await claveR2(user, modulo));
    if (!object) return null;
    const entry = await object.json().catch(() => null);
    if (
      !entry?.value?.ok
      || entry.email !== clean(user?.email).toLowerCase()
      || entry.modulo !== clean(modulo).toLowerCase()
      || Date.now() - Number(entry.savedAt || 0) > CACHE_MS
    ) return null;
    gardarMemoria(user, modulo, entry.value);
    return { ...entry.value, fonte: 'R2-PERMISOS' };
  } catch (error) {
    console.warn('Non se puido ler a caché común de permisos en R2:', error);
    return null;
  }
}

async function gardarR2(env, user, modulo, value) {
  if (!env.R2_PRIVADO?.put) return;
  try {
    await env.R2_PRIVADO.put(await claveR2(user, modulo), JSON.stringify({
      savedAt: Date.now(),
      email: clean(user?.email).toLowerCase(),
      modulo: clean(modulo).toLowerCase(),
      value
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
      customMetadata: { tipo: 'permisos-portal', version: '1' }
    });
  } catch (error) {
    console.warn('Non se puido gardar a caché común de permisos en R2:', error);
  }
}

export async function obterPermisoPortalCacheado(env, user, modulo) {
  const email = clean(user?.email).toLowerCase();
  const nomeModulo = clean(modulo).toLowerCase();
  if (!email || !nomeModulo) return null;
  const memory = lerMemoria(user, nomeModulo);
  if (memory) return { ...memory, fonte: 'MEMORIA' };
  return lerR2(env, user, nomeModulo);
}

export async function obterPermisoPortal(env, user, modulo) {
  const email = clean(user?.email).toLowerCase();
  const nomeModulo = clean(modulo).toLowerCase();
  if (!email || !nomeModulo) {
    return { ok: false, nivel: 'sen_acceso', fonte: 'INVALID', configurado: false };
  }

  const cacheado = await obterPermisoPortalCacheado(env, user, nomeModulo);
  if (cacheado) return cacheado;

  if (!env.WEB_WRITE_TOKEN) {
    throw new Error('O servizo común de permisos non está configurado.');
  }

  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'obterPermisosUsuarioPortal',
    email,
    usuarioEmail: email,
    uidFirebase: clean(user?.uid)
  }, { timeoutMs: 12_000, attemptTimeoutMs: 7_000 });

  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non foi posible resolver os permisos do portal.');
  }

  const permisos = Array.isArray(resultado.permisos) ? resultado.permisos : [];
  const especifico = permisos.find((item) =>
    item?.activo !== false
    && clean(item?.modulo).toLowerCase() === nomeModulo
    && !clean(item?.contido)
  );
  const nivel = normalizarNivel(resultado?.efectivos?.[nomeModulo] || especifico?.nivel);
  const value = {
    ok: true,
    nivel,
    fonte: 'PERMISOS_PORTAL',
    configurado: Boolean(especifico),
    podeLer: ['lectura', 'escritura', 'administracion'].includes(nivel),
    podeEscribir: ['escritura', 'administracion'].includes(nivel),
    podeAdministrar: nivel === 'administracion'
  };
  gardarMemoria(user, nomeModulo, value);
  await gardarR2(env, user, nomeModulo, value);
  return value;
}
