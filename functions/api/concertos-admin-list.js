import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const CONCERT_INDEX_KEY = 'indices/concertos-privado-v1.json';
const ATTENDANCE_INDEX_KEY = 'indices/asistencias-concertos.json';

const clean = (value) => String(value || '').trim();
const rama = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const concertIndexKey = (env) => rama(env) === 'main' ? CONCERT_INDEX_KEY : 'indices/preview/concertos-privado-v1.json';
const attendanceIndexKey = (env) => rama(env) === 'main' ? ATTENDANCE_INDEX_KEY : 'indices/preview/asistencias-concertos.json';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_FIREBASE_MS) {
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
  const response = await fetchWithTimeout(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    }
  );
  if (!response.ok) return null;
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  return { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(clean(email).toLowerCase())
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function comprobarAdministracionR2(env, user) {
  if (!env.R2_PRIVADO?.get) return { allowed: false, known: false };
  try {
    const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
    if (!object) return { allowed: false, known: false };
    const entry = await object.json().catch(() => null);
    const allowed = clean(entry?.administrador).toLowerCase() === user.email
      && entry?.payload?.perfil?.nivel === 'Administración';
    return { allowed, known: true };
  } catch (error) {
    console.error('Erro ao comprobar o fallback administrativo de Concertos:', error);
    return { allowed: false, known: false };
  }
}

async function comprobarAccesoConcertos(context, user) {
  const { env } = context;
  const cacheado = await obterPermisoPortalCacheado(env, user, 'concertos');
  if (cacheado?.podeLer) {
    return { allowed: true, known: true, nivel: cacheado.nivel, fonte: cacheado.fonte };
  }

  const administration = await comprobarAdministracionR2(env, user);
  if (administration.allowed) {
    const preparar = obterPermisoPortal(env, user, 'concertos').catch((error) => {
      console.warn('Non se puido preparar a caché común do permiso Concertos:', error);
    });
    if (typeof context.waitUntil === 'function') context.waitUntil(preparar);
    else preparar.catch(() => {});
    return { allowed: true, known: true, nivel: 'administracion', fonte: 'ADMIN_R2_FALLBACK' };
  }

  let permiso = cacheado;
  if (!permiso) {
    try {
      permiso = await obterPermisoPortal(env, user, 'concertos');
    } catch (error) {
      console.error('Erro ao resolver o permiso común de Concertos:', error);
    }
  }

  if (permiso?.podeLer) {
    return { allowed: true, known: true, nivel: permiso.nivel, fonte: permiso.fonte };
  }

  return {
    allowed: false,
    known: Boolean(permiso?.ok) || administration.known,
    nivel: permiso?.nivel || 'sen_acceso',
    fonte: permiso?.fonte || (administration.known ? 'ADMIN_R2' : 'UNAVAILABLE')
  };
}

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function readWithFallback(bucket, primary, fallback) {
  const first = await readJson(bucket, primary);
  if (first || primary === fallback) return first;
  return readJson(bucket, fallback);
}

function estadoConcerto(value) {
  const normal = clean(value).toLowerCase();
  return {
    previsto: 'Previsto',
    confirmado: 'Confirmado',
    aprazado: 'Aprazado',
    cancelado: 'Cancelado',
    realizado: 'Realizado'
  }[normal] || clean(value);
}

async function listarDesdeR2(env) {
  const [index, attendance] = await Promise.all([
    readWithFallback(env.R2_PRIVADO, concertIndexKey(env), CONCERT_INDEX_KEY),
    readWithFallback(env.R2_PRIVADO, attendanceIndexKey(env), ATTENDANCE_INDEX_KEY)
  ]);

  if (!index?.ok || !Array.isArray(index.concertos)) {
    throw Object.assign(new Error('O índice privado de concertos non está dispoñible.'), {
      code: 'R2_CONCERT_INDEX_MISSING'
    });
  }

  const porConcerto = attendance?.resultado?.asistenciasPorConcerto || {};
  const today = new Date().toISOString().slice(0, 10);
  return index.concertos
    .filter((concerto) => !clean(concerto.id).startsWith('hist-') && (!clean(concerto.data) || clean(concerto.data) >= today))
    .map((concerto) => ({
      idConcerto: clean(concerto.id),
      data: clean(concerto.data),
      nome: clean(concerto.nome),
      cidade: clean(concerto.cidade),
      lugar: clean(concerto.lugar),
      hora: clean(concerto.hora),
      estado: estadoConcerto(concerto.estado),
      mostrarWeb: concerto.mostrarWeb === true,
      destacadoWeb: concerto.destacadoWeb === true,
      caracteristicas: clean(concerto.caracteristicas),
      cartel: clean(concerto.cartel),
      triptico: clean(concerto.triptico),
      asistencias: Array.isArray(porConcerto[clean(concerto.id)]) ? porConcerto[clean(concerto.id)].length : 0,
      obras: Array.isArray(concerto.programa) ? concerto.programa.length : 0
    }))
    .filter((concerto) => concerto.idConcerto)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo de Concertos non está configurado.' });
  }

  const body = await request.json().catch(() => null);
  if (!body) return json(400, { ok: false, erro: 'Solicitude non válida.' });

  let user;
  try {
    user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY);
  } catch (error) {
    console.error('Erro ao validar Firebase na lista de Concertos:', error);
    return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
  }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  const acceso = await comprobarAccesoConcertos(context, user);
  if (!acceso.allowed) {
    return json(acceso.known ? 403 : 503, {
      ok: false,
      codigo: acceso.known ? 'CONCERTOS_PERMISSION_REQUIRED' : 'PERMISSION_UNAVAILABLE',
      erro: acceso.known
        ? 'Non tes permiso para consultar a administración de concertos.'
        : 'Non foi posible comprobar o permiso de acceso neste momento.'
    }, { 'X-SCPP-Permission-Source': acceso.fonte || 'UNAVAILABLE' });
  }

  try {
    const concertos = await listarDesdeR2(env);
    return json(200, {
      ok: true,
      nivel: acceso.nivel || 'administracion',
      concertos,
      almacen: 'R2',
      fonte: rama(env) === 'main' ? 'R2-CONCERTOS-PRODUCION' : 'R2-CONCERTOS-PREVIEW'
    }, {
      'X-SCPP-Permission-Source': acceso.fonte || 'UNKNOWN',
      'X-SCPP-Permission-Level': acceso.nivel || 'sen_acceso',
      'X-SCPP-Storage': 'R2'
    });
  } catch (error) {
    console.error('Erro ao listar Concertos desde R2:', error);
    return json(503, {
      ok: false,
      codigo: error?.code || 'R2_UNAVAILABLE',
      erro: error?.message || 'Non foi posible cargar os concertos desde R2.'
    });
  }
}
