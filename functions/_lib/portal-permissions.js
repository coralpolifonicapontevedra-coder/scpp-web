import { obterJsonAppsScript } from './apps-script.js';

const CACHE_MS = 60 * 1000;
const cache = new Map();
const niveisValidos = new Set(['sen_acceso', 'lectura', 'escritura', 'administracion']);

const clean = (value) => String(value || '').trim();

function normalizarNivel(value) {
  const nivel = clean(value).toLowerCase();
  return niveisValidos.has(nivel) ? nivel : 'sen_acceso';
}

function clave(user, modulo) {
  return `${clean(user?.email).toLowerCase()}::${clean(modulo).toLowerCase()}`;
}

function lerCache(user, modulo) {
  const key = clave(user, modulo);
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.value;
}

function gardarCache(user, modulo, value) {
  cache.set(clave(user, modulo), { value, expiresAt: Date.now() + CACHE_MS });
  while (cache.size > 100) cache.delete(cache.keys().next().value);
}

export async function obterPermisoPortal(env, user, modulo) {
  const email = clean(user?.email).toLowerCase();
  const nomeModulo = clean(modulo).toLowerCase();
  if (!email || !nomeModulo) {
    return { ok: false, nivel: 'sen_acceso', fonte: 'INVALID', configurado: false };
  }

  const cacheado = lerCache(user, nomeModulo);
  if (cacheado) return { ...cacheado, fonte: 'MEMORIA' };

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
  gardarCache(user, nomeModulo, value);
  return value;
}
