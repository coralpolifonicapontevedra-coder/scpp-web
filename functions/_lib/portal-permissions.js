import { obterJsonAppsScript } from './apps-script.js';

const CACHE_R2_MS = 24 * 60 * 60 * 1000;
const R2_PREFIX = 'permisos/cache-v2/';
const niveisValidos = new Set(['sen_acceso', 'lectura', 'escritura', 'administracion']);

const clean = (value) => String(value || '').trim();
const ramaActual = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';

function normalizarNivel(value) {
  const nivel = clean(value).toLowerCase();
  return niveisValidos.has(nivel) ? nivel : 'sen_acceso';
}

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function claveR2(env, user, modulo) {
  const email = clean(user?.email).toLowerCase();
  const nomeModulo = clean(modulo).toLowerCase();
  return `${R2_PREFIX}${ramaActual(env)}/${await hash(`${email}::${nomeModulo}`)}.json`;
}

async function lerR2(env, user, modulo) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(await claveR2(env, user, modulo));
    if (!object) return null;
    const entry = await object.json().catch(() => null);
    const email = clean(user?.email).toLowerCase();
    const nomeModulo = clean(modulo).toLowerCase();
    if (
      !entry?.value?.ok
      || entry.email !== email
      || entry.modulo !== nomeModulo
      || Date.now() - Number(entry.savedAt || 0) > CACHE_R2_MS
    ) return null;
    return { ...entry.value, fonte: 'R2-PERMISOS' };
  } catch (error) {
    console.warn('Non se puido ler a caché común de permisos en R2:', error);
    return null;
  }
}

async function gardarR2(env, user, modulo, value) {
  if (!env.R2_PRIVADO?.put) return;
  try {
    const email = clean(user?.email).toLowerCase();
    const nomeModulo = clean(modulo).toLowerCase();
    await env.R2_PRIVADO.put(await claveR2(env, user, nomeModulo), JSON.stringify({
      savedAt: Date.now(),
      email,
      modulo: nomeModulo,
      value
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
      customMetadata: { tipo: 'permisos-portal', version: '2', contorno: ramaActual(env) }
    });
  } catch (error) {
    console.warn('Non se puido gardar a caché común de permisos en R2:', error);
  }
}

export async function invalidarPermisosPortal(env, email, modulos = []) {
  if (!env.R2_PRIVADO?.delete) return;
  const usuario = { email: clean(email).toLowerCase() };
  if (!usuario.email) return;
  const lista = [...new Set((Array.isArray(modulos) ? modulos : [modulos])
    .map((modulo) => clean(modulo).toLowerCase())
    .filter(Boolean))];
  await Promise.all(lista.map(async (modulo) => {
    try {
      await env.R2_PRIVADO.delete(await claveR2(env, usuario, modulo));
    } catch (error) {
      console.warn(`Non se puido invalidar o permiso ${modulo} de ${usuario.email}:`, error);
    }
  }));
}

export async function obterPermisoPortalCacheado(env, user, modulo) {
  const email = clean(user?.email).toLowerCase();
  const nomeModulo = clean(modulo).toLowerCase();
  if (!email || !nomeModulo) return null;
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
  await gardarR2(env, user, nomeModulo, value);
  return value;
}
