import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const ENSAIOS_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';
const ADMIN_V2_PREFIX = 'ensaios/admin-v2/';
const LIST_TTL_MS = 5 * 60 * 1000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const clean = (value) => String(value || '').trim();
const branch = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const listCacheKey = (env) => `${ADMIN_V2_PREFIX}${branch(env)}/list.json`;

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const tokenCache = new Map();

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const cached = tokenCache.get(token);
  if (cached?.expires > Date.now()) return cached.user;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchConLimite(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token })
        },
        TIMEOUT_FIREBASE_MS
      );
      if (!response.ok) return null;
      const data = (await response.json())?.users?.[0];
      if (!data?.email || data.emailVerified !== true) return null;
      const user = { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
      tokenCache.set(token, { user, expires: Date.now() + 5 * 60 * 1000 });
      while (tokenCache.size > 100) tokenCache.delete(tokenCache.keys().next().value);
      return user;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Firebase non dispoñible');
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function verificarAdministracionR2(env, user) {
  if (!env.R2_PRIVADO?.get) return false;
  const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const entry = await object.json().catch(() => null);
  return entry?.administrador === user.email && entry?.payload?.perfil?.nivel === 'Administración';
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: user.email,
    uidFirebase: user.uid,
    ...datos
  }, { timeoutMs: TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs: 8_000 });

  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

function refEnsaio(item = {}) {
  return clean(item.ensaio || item.Ensaio || item.idEnsaio || item.Id_Ensaio);
}

function idEnsaio(item = {}) {
  return clean(item.idEnsaio || item.Id_Ensaio || item.IdEnsaio || item.id);
}

function booleano(value) {
  return value === true || ['true', '1', 'si', 'sí', 'yes', 'x'].includes(clean(value).toLowerCase());
}

function prepararLista(result) {
  const asistencias = Array.isArray(result.asistencias) ? result.asistencias : [];
  const repertorio = Array.isArray(result.ensaiosRepertorio) ? result.ensaiosRepertorio : [];
  const countAsistencias = new Map();
  const countObras = new Map();

  asistencias.forEach((row) => {
    const id = refEnsaio(row);
    if (id) countAsistencias.set(id, (countAsistencias.get(id) || 0) + 1);
  });
  repertorio.forEach((row) => {
    const id = refEnsaio(row);
    if (id) countObras.set(id, (countObras.get(id) || 0) + 1);
  });

  return (Array.isArray(result.ensaios) ? result.ensaios : [])
    .map((item) => {
      const id = idEnsaio(item);
      return {
        idEnsaio: id,
        data: clean(item.data || item.Data).slice(0, 10),
        horaInicio: clean(item.horaInicio || item.HoraInicio),
        horaFin: clean(item.horaFin || item.HoraFin),
        lugar: clean(item.lugar || item.Lugar),
        tipoEnsaio: clean(item.tipoEnsaio || item.TipoEnsaio) || 'Ensaio',
        concerto: clean(item.concerto || item.Concerto),
        concertoNome: clean(item.concertoNome || item.ConcertoNome),
        descricion: clean(item.descricion || item.Descricion),
        observacions: clean(item.observacions || item.Observacions),
        cancelado: booleano(item.cancelado ?? item.Cancelado),
        obras: countObras.get(id) || 0,
        asistencias: countAsistencias.get(id) || 0
      };
    })
    .filter((item) => item.idEnsaio)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
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
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo: 'ensaios-admin-v2', version: '2' }
  });
}

async function lerListaCache(env) {
  const entry = await readJson(env.R2_PRIVADO, listCacheKey(env));
  if (!entry?.payload || !entry?.createdAt) return null;
  const age = Date.now() - Date.parse(entry.createdAt);
  return Number.isFinite(age) && age >= 0 && age <= LIST_TTL_MS ? entry.payload : null;
}

async function gardarListaCache(env, payload) {
  await writeJson(env.R2_PRIVADO, listCacheKey(env), { createdAt: new Date().toISOString(), payload });
}

async function deletePrefix(bucket, prefix) {
  if (!bucket?.list || !bucket?.delete) return;
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    const keys = (page.objects || []).map((item) => item.key);
    if (keys.length) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

async function invalidarCacheEnsaios(env) {
  await Promise.all([
    deletePrefix(env.R2_PRIVADO, ENSAIOS_CACHE_PREFIX),
    deletePrefix(env.R2_PRIVADO, `${ADMIN_V2_PREFIX}${branch(env)}/`)
  ]);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'O servizo non está configurado.' });

  const body = await request.json().catch(() => null);
  if (!body) return json(400, { ok: false, erro: 'Solicitude non válida.' });

  let user;
  try {
    user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY);
  } catch (error) {
    console.error('Erro ao validar Firebase en Ensaios v2:', error);
    return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
  }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  let admin = false;
  try {
    admin = await verificarAdministracionR2(env, user);
  } catch (error) {
    console.error('Erro ao comprobar Administración R2 en Ensaios v2:', error);
  }
  if (!admin) return json(403, { ok: false, erro: 'Usuario non autorizado para Administración.' });

  const accion = clean(body.accion || 'listar');

  try {
    if (accion === 'listar') {
      const cached = await lerListaCache(env);
      if (cached) return json(200, { ...cached, fonte: 'R2-ADMIN-V2' });

      const result = await chamarAppsScript(env, user, 'listarEnsaiosPortal');
      const payload = {
        ok: true,
        nivel: 'Administración',
        ensaios: prepararLista(result),
        fonte: 'APPS-SCRIPT-ADMIN-V2'
      };
      await gardarListaCache(env, payload).catch((error) => console.warn('Non se puido cachear a listaxe de Ensaios v2:', error));
      return json(200, payload);
    }

    if (accion === 'crear') {
      const data = clean(body.data);
      const horaInicio = clean(body.horaInicio);
      const tipoEnsaio = clean(body.tipoEnsaio);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !horaInicio || !tipoEnsaio) {
        return json(400, { ok: false, erro: 'Data, hora de inicio e tipo de ensaio son obrigatorios.' });
      }
      const result = await chamarAppsScript(env, user, 'gardarEnsaioPortal', {
        data,
        horaInicio,
        horaFin: clean(body.horaFin),
        lugar: clean(body.lugar),
        tipoEnsaio,
        concerto: clean(body.concerto),
        descricion: clean(body.descricion),
        observacions: clean(body.observacions),
        cancelado: false
      });
      await invalidarCacheEnsaios(env);
      return json(200, { ok: true, resultado: result.resultado || result });
    }

    if (accion === 'cambiarData') {
      const id = clean(body.idEnsaio);
      const data = clean(body.data);
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return json(400, { ok: false, erro: 'Indica un ensaio e unha data válida.' });
      const result = await chamarAppsScript(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio: id, data, cancelado: false });
      await invalidarCacheEnsaios(env);
      return json(200, { ok: true, resultado: result.resultado || result });
    }

    if (accion === 'darBaixa') {
      const id = clean(body.idEnsaio);
      if (!id) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });
      const result = await chamarAppsScript(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio: id, cancelado: true });
      await invalidarCacheEnsaios(env);
      return json(200, { ok: true, resultado: result.resultado || result });
    }

    if (accion === 'eliminar') {
      const id = clean(body.idEnsaio);
      if (!id) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });
      const result = await chamarAppsScript(env, user, 'eliminarEnsaioPortal', { idEnsaio: id });
      await invalidarCacheEnsaios(env);
      return json(200, { ok: true, resultado: result.resultado || result });
    }

    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 502;
    return json(status, { ok: false, codigo: code, erro: error?.message || 'Non foi posible completar a operación.' });
  }
}
