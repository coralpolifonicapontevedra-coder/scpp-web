import { obterJsonAppsScript } from './apps-script.js';

const CACHE_R2_MS = 5 * 60 * 1000;
const R2_PREFIX = 'permisos/cache-v2/';
const AUTH_PREFIX = 'permisos/autorizacion-v1/';
const AUTH_MAX_MS = 60 * 1000;
const MODULOS_LECTURA = ['fotografias', 'partituras', 'repertorio', 'documentacion', 'concertos'];
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
      || !Number.isFinite(Number(entry.savedAt))
      || Date.now() - Number(entry.savedAt) < 0
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
  const claves = await Promise.all(lista.map((modulo) => claveR2(env, usuario, modulo)));
  // Estas autorizacións históricas tamén son consumidas polos editores de fotos.
  // Un cambio de módulo nunca debe deixar un permiso administrativo antigo vivo.
  const correoHash = await hash(usuario.email);
  claves.push(`cache/autorizacion-fotos/${correoHash}.json`);
  claves.push(`persoas/cache/administracion/${correoHash}.json`);
  for (const modulo of MODULOS_LECTURA) {
    claves.push(await claveAutorizacion(env, usuario, modulo, 'lectura'));
  }
  claves.push(await claveAutorizacion(env, usuario, 'fotografias', 'administracion'));
  await Promise.all(claves.map((clave) => env.R2_PRIVADO.delete(clave)));
}

export async function obterPermisoPortalCacheado(env, user, modulo) {
  const email = clean(user?.email).toLowerCase();
  const nomeModulo = clean(modulo).toLowerCase();
  if (!email || !nomeModulo) return null;
  return lerR2(env, user, nomeModulo);
}

export async function obterPermisoPortal(env, user, modulo, { fresco = false } = {}) {
  const email = clean(user?.email).toLowerCase();
  const nomeModulo = clean(modulo).toLowerCase();
  if (!email || !nomeModulo) {
    return { ok: false, nivel: 'sen_acceso', fonte: 'INVALID', configurado: false };
  }

  const cacheado = fresco ? null : await obterPermisoPortalCacheado(env, user, nomeModulo);
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

  if (fresco && (!Array.isArray(resultado.permisos) || !resultado.efectivos ||
      typeof resultado.efectivos !== 'object' || Array.isArray(resultado.efectivos))) {
    throw new Error('A resposta de permisos non é válida.');
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
    configurado: Boolean(especifico) || Object.hasOwn(resultado?.efectivos || {}, nomeModulo),
    podeLer: ['lectura', 'escritura', 'administracion'].includes(nivel),
    podeEscribir: ['escritura', 'administracion'].includes(nivel),
    podeAdministrar: nivel === 'administracion'
  };
  // As consultas de autorización fresca non reintroducen cachés en paralelo
  // cunha revogación que xa estea en curso.
  if (!fresco) await gardarR2(env, user, nomeModulo, value);
  return value;
}

async function permisoUsuarioActivo(env, user, modulo) {
  if (!clean(user?.email) || !env.WEB_WRITE_TOKEN) {
    throw new Error('Non foi posible comprobar a autorización do portal.');
  }
  // Esta acción valida UsuariosWeb/Persoas activos no backend de produción.
  // Non se reutiliza a caché da aceptación legal como autorización.
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'comprobarAceptacion',
    email: clean(user.email).toLowerCase(),
    uidFirebase: clean(user.uid)
  }, { timeoutMs: 18_000 });
  if (resultado?.ok !== true) {
    if (resultado?.erro === 'Usuario non autorizado') return null;
    throw new Error('Non foi posible comprobar a alta no portal.');
  }
  return obterPermisoPortal(env, user, modulo, { fresco: true });
}

async function claveAutorizacion(env, user, modulo, tipo) {
  return `${AUTH_PREFIX}${ramaActual(env)}/${await hash(`${clean(user.email).toLowerCase()}::${modulo}::${tipo}`)}.json`;
}

async function autorizacionAcoutada(env, user, modulo, tipo, resolver, fresco) {
  // Só decisións de lectura, nunca escrituras. O prazo absoluto non se renova
  // ao ler: limita tamén unha invalidación perdida ou unha carreira de escritura.
  const key = await claveAutorizacion(env, user, modulo, tipo);
  const email = clean(user.email).toLowerCase();
  if (!fresco && env.R2_PRIVADO?.get) {
    try {
      const object = await env.R2_PRIVADO.get(key);
      const entry = object ? await object.json() : null;
      const age = Date.now() - Number(entry?.savedAt);
      if (entry?.email === email && entry.modulo === modulo && entry.tipo === tipo &&
          Number.isFinite(age) && age >= 0 && age < AUTH_MAX_MS && typeof entry.allowed === 'boolean') {
        return entry.allowed;
      }
    } catch { /* Sen caché, comprobar sempre coa fonte autorizada. */ }
  }
  const startedAt = Date.now();
  const allowed = await resolver();
  if (!fresco && env.R2_PRIVADO?.put) {
    try {
      await env.R2_PRIVADO.put(key, JSON.stringify({ email, modulo, tipo, allowed, savedAt: startedAt }), {
        httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' }
      });
    } catch { /* Un fallo de caché non altera a decisión xa verificada. */ }
  }
  return allowed;
}

export async function comprobarLecturaPortal(env, user, modulo, { fresco = false } = {}) {
  return autorizacionAcoutada(env, user, modulo, 'lectura', async () => {
    const permiso = await permisoUsuarioActivo(env, user, modulo);
    // Conserva a lectura ordinaria dos membros activos sen excepción configurada.
    // Un permiso explícito (incluído sen_acceso) sempre prevalece.
    return permiso?.ok === true && (!permiso.configurado || permiso.podeLer === true);
  }, fresco);
}

async function administracionFotosActual(env, user) {
  const permiso = await permisoUsuarioActivo(env, user, 'fotografias');
  if (!permiso?.ok) return false;
  if (permiso.configurado) return permiso.podeEscribir === true;
  // Conserva o rol institucional cando non hai permiso individual configurado.
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'comprobarFotosAdministracionPortal',
    email: clean(user.email).toLowerCase(),
    uidFirebase: clean(user.uid)
  }, { timeoutMs: 18_000 });
  if (resultado?.ok === true && resultado.administrador === true) return true;
  if (resultado?.administrador === false) return false;
  throw new Error('Non foi posible comprobar a administración de fotografías.');
}

export async function comprobarAdministracionFotosPortal(env, user, { fresco = true } = {}) {
  return autorizacionAcoutada(env, user, 'fotografias', 'administracion', () => administracionFotosActual(env, user), fresco);
}
