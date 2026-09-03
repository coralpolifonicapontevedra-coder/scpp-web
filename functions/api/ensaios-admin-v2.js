import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const ENSAIOS_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';
const LEGACY_ADMIN_PREFIX = 'ensaios/admin-v2/';
const CONCERTOS_PRIVATE_INDEX_KEY = 'indices/concertos-privado-v1.json';
const URL_PROD_ENSAIOS_ADMIN = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const URL_PREVIEW_ENSAIOS_ADMIN = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

const clean = (value) => String(value || '').trim();
const branch = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const urlAppsScriptEnsaiosAdmin = (env) => branch(env) === 'main' ? URL_PROD_ENSAIOS_ADMIN : URL_PREVIEW_ENSAIOS_ADMIN;

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal }); }
  finally { clearTimeout(timer); }
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
      const response = await fetchConLimite(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
      }, TIMEOUT_FIREBASE_MS);
      if (!response.ok) return null;
      const data = (await response.json())?.users?.[0];
      if (!data?.email || data.emailVerified !== true) return null;
      const user = { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
      tokenCache.set(token, { user, expires: Date.now() + 5 * 60 * 1000 });
      while (tokenCache.size > 100) tokenCache.delete(tokenCache.keys().next().value);
      return user;
    } catch (error) { lastError = error; }
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
  }, {
    timeoutMs: TIMEOUT_APPS_SCRIPT_MS,
    attemptTimeoutMs: 8_000,
    urlOverride: urlAppsScriptEnsaiosAdmin(env)
  });
  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function writeJson(bucket, key, value, tipo = 'ensaios-cache-v2') {
  if (!bucket?.put) return;
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo, version: '2' }
  });
}

async function sharedKey(user) {
  return `${ENSAIOS_CACHE_PREFIX}${await hashEmail(user.email)}.json`;
}

function payloadValido(payload) {
  return payload?.ok === true && payload?.version === 2 && Array.isArray(payload.ensaios) && Array.isArray(payload.persoas);
}

async function lerSharedR2(env, user) {
  const entry = await readJson(env.R2_PRIVADO, await sharedKey(user));
  if (entry?.email !== user.email || !payloadValido(entry?.payload)) return null;
  return entry.payload;
}

async function gardarSharedR2(env, user, payload) {
  if (!payloadValido(payload)) return;
  await writeJson(env.R2_PRIVADO, await sharedKey(user), { savedAt: Date.now(), email: user.email, payload });
}

async function lerConcertosPrivados(env) {
  const previewKey = branch(env) === 'main' ? CONCERTOS_PRIVATE_INDEX_KEY : 'indices/preview/concertos-privado-v1.json';
  let index = await readJson(env.R2_PRIVADO, previewKey);
  if ((!index?.ok || !Array.isArray(index.concertos)) && previewKey !== CONCERTOS_PRIVATE_INDEX_KEY) {
    index = await readJson(env.R2_PRIVADO, CONCERTOS_PRIVATE_INDEX_KEY);
  }
  return index?.ok && Array.isArray(index.concertos) ? index.concertos : [];
}

async function crearPayload(env, result) {
  return {
    ok: true,
    version: 2,
    perfil: result.perfil || {},
    ensaios: Array.isArray(result.ensaios) ? result.ensaios : [],
    persoas: Array.isArray(result.persoas) ? result.persoas : [],
    asistencias: Array.isArray(result.asistencias) ? result.asistencias : [],
    ensaiosRepertorio: Array.isArray(result.ensaiosRepertorio) ? result.ensaiosRepertorio : [],
    repertorio: Array.isArray(result.repertorio) ? result.repertorio : [],
    concertos: await lerConcertosPrivados(env),
    seguimento: result.seguimento || {},
    xeradoEn: new Date().toISOString()
  };
}

async function refrescarSharedR2(env, user) {
  const result = await chamarAppsScript(env, user, 'listarEnsaiosPortal');
  const payload = await crearPayload(env, result);
  await gardarSharedR2(env, user, payload);
  return payload;
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
  asistencias.forEach((row) => { const id = refEnsaio(row); if (id) countAsistencias.set(id, (countAsistencias.get(id) || 0) + 1); });
  repertorio.forEach((row) => { const id = refEnsaio(row); if (id) countObras.set(id, (countObras.get(id) || 0) + 1); });
  return (Array.isArray(result.ensaios) ? result.ensaios : []).map((item) => {
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
  }).filter((item) => item.idEnsaio).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

async function lerLegacyList(env) {
  const entry = await readJson(env.R2_PRIVADO, `${LEGACY_ADMIN_PREFIX}${branch(env)}/list.json`);
  return entry?.payload?.ok === true && Array.isArray(entry.payload.ensaios) ? entry.payload : null;
}

async function respostaLista(env, user) {
  const shared = await lerSharedR2(env, user);
  if (shared) {
    return { ok: true, nivel: 'Administración', ensaios: prepararLista(shared), fonte: 'R2-COMPARTIDO' };
  }

  // Compatibilidade de transición: a antiga caché v2 nunca provoca un 502 por caducidade.
  const legacy = await lerLegacyList(env);
  if (legacy) {
    refrescarSharedR2(env, user).catch((error) => console.warn('Non se puido rexenerar R2 compartido en segundo plano:', error));
    return { ...legacy, nivel: 'Administración', fonte: 'R2-LEGACY-FALLBACK' };
  }

  const fresh = await refrescarSharedR2(env, user);
  return { ok: true, nivel: 'Administración', ensaios: prepararLista(fresh), fonte: 'SHEET-SEED' };
}

async function escribirERexenerar(env, user, accion, datos) {
  const result = await chamarAppsScript(env, user, accion, datos);
  // Nunca se borra primeiro o último R2 útil. Se Apps Script falla ao rexenerar,
  // mantense a copia anterior e a seguinte apertura segue funcionando.
  await refrescarSharedR2(env, user).catch((error) => console.warn('Escritura completada; mantense R2 anterior porque non se puido rexenerar:', error));
  return result;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  const body = await request.json().catch(() => null);
  if (!body) return json(400, { ok: false, erro: 'Solicitude non válida.' });

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user).catch(() => false))) return json(403, { ok: false, erro: 'Usuario non autorizado para Administración.' });

  const accion = clean(body.accion || 'listar');
  try {
    if (accion === 'listar') {
      const payload = await respostaLista(env, user);
      return json(200, payload, { 'X-SCPP-Storage': payload.fonte || 'R2' });
    }

    if (accion === 'crear') {
      const data = clean(body.data), horaInicio = clean(body.horaInicio), tipoEnsaio = clean(body.tipoEnsaio);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !horaInicio || !tipoEnsaio) return json(400, { ok: false, erro: 'Data, hora de inicio e tipo de ensaio son obrigatorios.' });
      const result = await escribirERexenerar(env, user, 'gardarEnsaioPortal', {
        data, horaInicio, horaFin: clean(body.horaFin), lugar: clean(body.lugar), tipoEnsaio,
        concerto: clean(body.concerto), descricion: clean(body.descricion), observacions: clean(body.observacions), cancelado: false
      });
      return json(200, { ok: true, resultado: result.resultado || result, almacen: 'SHEET+R2' });
    }

    if (accion === 'cambiarData') {
      const id = clean(body.idEnsaio), data = clean(body.data);
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return json(400, { ok: false, erro: 'Indica un ensaio e unha data válida.' });
      const result = await escribirERexenerar(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio: id, data, cancelado: false });
      return json(200, { ok: true, resultado: result.resultado || result, almacen: 'SHEET+R2' });
    }

    if (accion === 'darBaixa') {
      const id = clean(body.idEnsaio);
      if (!id) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });
      const result = await escribirERexenerar(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio: id, cancelado: true });
      return json(200, { ok: true, resultado: result.resultado || result, almacen: 'SHEET+R2' });
    }

    if (accion === 'eliminar') {
      const id = clean(body.idEnsaio);
      if (!id) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });
      const result = await escribirERexenerar(env, user, 'eliminarEnsaioPortal', { idEnsaio: id });
      return json(200, { ok: true, resultado: result.resultado || result, almacen: 'SHEET+R2' });
    }

    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : error?.name === 'AbortError' ? 504 : 502;
    return json(status, { ok: false, codigo: code, erro: error?.message || 'Non foi posible completar a operación.' });
  }
}
