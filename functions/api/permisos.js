import { obterJsonAppsScript } from '../_lib/apps-script.js';
import {
  invalidarPermisosPortal,
  obterPermisoPortal,
  obterPermisoPortalCacheado
} from '../_lib/portal-permissions.js';

const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const ADMIN_CONTEXT_MAX_MS = 60 * 60 * 1000;
const LIST_CACHE_PREFIX = 'permisos/xestion-cache-v1/';
const LIST_CACHE_FRESH_MS = 60 * 60 * 1000;
const LIST_CACHE_BACKUP_MS = 24 * 60 * 60 * 1000;

const clean = (value) => String(value || '').trim();
const ramaActual = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const listCacheKey = (env) => `${LIST_CACHE_PREFIX}${ramaActual(env)}/listado.json`;

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

  return {
    uid: clean(user.localId),
    email: clean(user.email).toLowerCase()
  };
}

async function hashEmail(email) {
  const bytes = new TextEncoder().encode(clean(email).toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nivelNormalizado(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function eContextoAdministracion(payload) {
  return nivelNormalizado(payload?.perfil?.nivel) === 'administracion';
}

async function obterContextoPersoas(env, user) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
    if (!object) return null;
    const entry = await object.json().catch(() => null);
    if (clean(entry?.administrador).toLowerCase() !== user.email) return null;
    const savedAt = Number(entry?.savedAt || 0);
    if (!savedAt || Date.now() - savedAt < 0 || Date.now() - savedAt > ADMIN_CONTEXT_MAX_MS) return null;
    return entry?.payload || null;
  } catch (error) {
    console.warn('Non se puido ler o contexto de Persoas en R2:', error);
    return null;
  }
}

async function invalidarContextoPersoas(env, email) {
  if (!env.R2_PRIVADO?.delete || !clean(email)) return;
  try {
    await env.R2_PRIVADO.delete(`${ADMIN_CACHE_PREFIX}${await hashEmail(email)}.json`);
  } catch (error) {
    console.warn('Non se puido invalidar o contexto administrativo de Persoas:', error);
  }
}

function fusionarPersoasConUsuarios(resultadoPermisos, resultadoPersoas) {
  const usuarios = Array.isArray(resultadoPermisos?.usuarios) ? resultadoPermisos.usuarios : [];
  const persoas = Array.isArray(resultadoPersoas?.persoas) ? resultadoPersoas.persoas : [];
  const porEmail = new Map();

  usuarios.forEach((usuario) => {
    const email = clean(usuario?.email).toLowerCase();
    if (!email) return;
    porEmail.set(email, {
      ...usuario,
      email,
      nome: clean(usuario?.nome || usuario?.persoa || email),
      tenUsuarioWeb: true
    });
  });

  persoas.forEach((persoa) => {
    if (persoa?.activo === false) return;
    const email = clean(persoa?.correo).toLowerCase();
    if (!email) return;

    const existente = porEmail.get(email);
    const nome = clean(
      persoa?.nomeCompleto ||
      [persoa?.nome, persoa?.primeiroApelido, persoa?.segundoApelido].filter(Boolean).join(' ') ||
      existente?.nome ||
      email
    );

    porEmail.set(email, {
      ...(existente || {}),
      email,
      persoa: clean(persoa?.rowId || persoa?.idPersoa || persoa?.id || existente?.persoa),
      nome,
      activo: true,
      tenUsuarioWeb: Boolean(existente?.tenUsuarioWeb)
    });
  });

  return Array.from(porEmail.values()).sort((a, b) =>
    clean(a.nome || a.email).localeCompare(clean(b.nome || b.email), 'gl', { sensitivity: 'base' })
  );
}

async function lerCacheListado(env) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(listCacheKey(env));
    if (!object) return null;
    const entry = await object.json().catch(() => null);
    if (!entry?.payload?.ok) return null;
    const savedAt = Number(entry.savedAt || 0);
    const idadeMs = Date.now() - savedAt;
    if (!savedAt || idadeMs < 0 || idadeMs > LIST_CACHE_BACKUP_MS) return null;
    return {
      payload: entry.payload,
      idadeMs,
      fresca: idadeMs <= LIST_CACHE_FRESH_MS
    };
  } catch (error) {
    console.warn('Non se puido ler a caché de xestión de permisos:', error);
    return null;
  }
}

async function gardarCacheListado(env, payload) {
  if (!payload?.ok || !env.R2_PRIVADO?.put) return;
  await env.R2_PRIVADO.put(listCacheKey(env), JSON.stringify({
    savedAt: Date.now(),
    payload
  }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo: 'xestion-permisos', version: '1', contorno: ramaActual(env) }
  });
}

async function borrarCacheListado(env) {
  if (!env.R2_PRIVADO?.delete) return;
  await env.R2_PRIVADO.delete(listCacheKey(env)).catch(() => {});
}

async function chamarAppsScript(env, payload, accion) {
  const { resultado } = await obterJsonAppsScript(env, payload, {
    timeoutMs: accion === 'gardarPermisosPortalLote' ? 30000 : 20000,
    attemptTimeoutMs: accion === 'gardarPermisosPortalLote' ? 15000 : 9000
  });
  if (!resultado?.ok) {
    const error = new Error(resultado?.erro || 'Non foi posible completar a operación.');
    error.resultado = resultado;
    throw error;
  }
  return resultado;
}

async function refrescarListado(env, user, contextoPersoas) {
  const resultado = await chamarAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarPermisosPortal',
    email: user.email,
    uidFirebase: user.uid,
    actorEmail: user.email
  }, 'listarPermisosPortal');
  const payload = { ...resultado };
  if (contextoPersoas) payload.usuarios = fusionarPersoasConUsuarios(payload, contextoPersoas);
  await gardarCacheListado(env, payload);
  return payload;
}

function modulosAfectados(accion, body) {
  if (accion === 'gardarPermisosPortalLote') {
    return [...new Set((Array.isArray(body?.cambios) ? body.cambios : [])
      .map((item) => clean(item?.modulo).toLowerCase())
      .filter(Boolean))];
  }
  if (accion === 'gardarPermisoPortal' || accion === 'eliminarPermisoPortal') {
    const modulo = clean(body?.modulo).toLowerCase();
    return modulo ? [modulo] : [];
  }
  return [];
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'O servizo de permisos non está configurado.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida.' });
  }

  let user;
  try {
    user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY);
  } catch {
    return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
  }

  if (!user) {
    return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });
  }

  const accion = clean(body?.accion);
  const permitidas = new Set([
    'listarPermisosPortal',
    'gardarPermisoPortal',
    'gardarPermisosPortalLote',
    'eliminarPermisoPortal',
    'listarActividadePortal',
    'rexistrarActividadePortal',
    'obterPermisosUsuarioPortal'
  ]);

  if (!permitidas.has(accion)) {
    return json(400, { ok: false, erro: 'Acción de permisos descoñecida.' });
  }

  const accionsAdmin = new Set([
    'listarPermisosPortal',
    'gardarPermisoPortal',
    'gardarPermisosPortalLote',
    'eliminarPermisoPortal',
    'listarActividadePortal',
    'rexistrarActividadePortal'
  ]);

  const contextoPersoas = accionsAdmin.has(accion)
    ? await obterContextoPersoas(env, user)
    : null;

  if (accionsAdmin.has(accion)) {
    const lecturaAdministrativa = accion === 'listarPermisosPortal' || accion === 'listarActividadePortal';
    const autorizadoDesdeR2 = lecturaAdministrativa && eContextoAdministracion(contextoPersoas);

    if (!autorizadoDesdeR2) {
      let permisoAdmin;
      try {
        permisoAdmin = await obterPermisoPortalCacheado(env, user, 'permisos');
        if (!permisoAdmin) permisoAdmin = await obterPermisoPortal(env, user, 'permisos');
      } catch (error) {
        return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible comprobar os permisos.' });
      }
      if (!permisoAdmin?.podeEscribir) {
        return json(403, { ok: false, codigo: 'ADMIN_REQUIRED', erro: 'A túa conta non ten permiso para xestionar os accesos.' });
      }
    }
  }

  if (accion === 'listarPermisosPortal') {
    const cache = await lerCacheListado(env);
    if (cache?.payload) {
      const payload = { ...cache.payload };
      if (contextoPersoas) payload.usuarios = fusionarPersoasConUsuarios(payload, contextoPersoas);
      if (!cache.fresca) {
        const tarefa = refrescarListado(env, user, contextoPersoas).catch((error) =>
          console.warn('Non se puido refrescar a xestión de permisos en segundo plano:', error)
        );
        if (typeof context.waitUntil === 'function') context.waitUntil(tarefa);
      }
      return json(200, {
        ...payload,
        administrador: true,
        cache: { orixe: 'r2', idadeMs: cache.idadeMs, fresca: cache.fresca }
      }, { 'X-SCPP-Permissions-Source': cache.fresca ? 'R2' : 'R2-STALE-WHILE-REVALIDATE' });
    }

    try {
      const payload = await refrescarListado(env, user, contextoPersoas);
      return json(200, {
        ...payload,
        administrador: true,
        cache: { orixe: 'apps-script', idadeMs: 0, fresca: true }
      }, { 'X-SCPP-Permissions-Source': 'SHEET-SEED' });
    } catch (error) {
      console.error('Erro ao cargar a xestión de permisos:', error);
      return json(502, { ok: false, erro: 'Non foi posible cargar a xestión de permisos.' });
    }
  }

  const payload = {
    ...body,
    token: env.WEB_WRITE_TOKEN,
    email: user.email,
    uidFirebase: user.uid,
    actorEmail: user.email
  };
  if (accion === 'obterPermisosUsuarioPortal') payload.usuarioEmail = user.email;
  delete payload.idToken;

  try {
    const resultado = await chamarAppsScript(env, payload, accion);

    const modulos = modulosAfectados(accion, body);
    const destinatario = clean(body?.usuarioEmail).toLowerCase();
    if (destinatario && modulos.length) {
      await invalidarPermisosPortal(env, destinatario, modulos);
      if (modulos.includes('permisos')) await invalidarContextoPersoas(env, destinatario);
    }

    if (['gardarPermisoPortal', 'gardarPermisosPortalLote', 'eliminarPermisoPortal'].includes(accion)) {
      await borrarCacheListado(env);
      const tarefa = refrescarListado(env, user, contextoPersoas).catch((error) =>
        console.warn('Permiso gardado; non se puido rexenerar aínda a caché de xestión:', error)
      );
      if (typeof context.waitUntil === 'function') context.waitUntil(tarefa);
      else await tarefa;
    }

    return json(200, resultado);
  } catch (error) {
    const resultado = error?.resultado;
    if (resultado?.codigo === 'ADMIN_REQUIRED') return json(403, resultado);
    console.error('Erro na API de permisos:', error);
    return json(502, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible contactar co servizo de permisos.' });
  }
}
