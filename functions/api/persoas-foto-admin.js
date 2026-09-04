import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';
import { obterPermisoPortal } from '../_lib/portal-permissions.js';

const MODULO = 'persoas';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_INDEX_MAIN = 'persoas/fotos/index.json';
const PHOTO_INDEX_PREVIEW = 'persoas/fotos/preview/index.json';
const SNAPSHOT_MAIN = 'persoas/cache/snapshot-v4.json';
const SNAPSHOT_PREVIEW = 'persoas/cache/preview/snapshot-v4.json';
const PERFIS_MAIN = 'persoas/cache/perfis.json';
const PERFIS_PREVIEW = 'persoas/cache/preview/perfis.json';
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const PROFILE_MARKER_KEY = '__perfil__';

const clean = (value) => String(value == null ? '' : value).trim();
const safeId = (value) => clean(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
const branch = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const indexKey = (env) => branch(env) === 'main' ? PHOTO_INDEX_MAIN : PHOTO_INDEX_PREVIEW;
const snapshotKey = (env) => branch(env) === 'main' ? SNAPSHOT_MAIN : SNAPSHOT_PREVIEW;
const perfisKey = (env) => branch(env) === 'main' ? PERFIS_MAIN : PERFIS_PREVIEW;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
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

async function contextFor(env, user, write = false) {
  const permiso = await obterPermisoPortal(env, user, MODULO);
  const allowed = write ? permiso?.podeEscribir : permiso?.podeLer;
  return { permiso, allowed: Boolean(allowed) };
}

async function callAppsScript(env, user, accion, extra = {}) {
  if (!env.WEB_WRITE_TOKEN) throw new Error('WEB_WRITE_TOKEN non está configurado.');
  const { resultado } = await obterJsonAppsScriptPersoas(env, {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: user?.email || '',
    actorEmail: user?.email || '',
    uidFirebase: user?.uid || '',
    ...extra
  }, { timeoutMs: 30_000, attemptTimeoutMs: 12_000 });
  return resultado;
}

async function readJson(env, key) {
  if (!env.R2_PRIVADO?.get) return null;
  const object = await env.R2_PRIVADO.get(key);
  return object ? object.json().catch(() => null) : null;
}

function marker(ruta = '') {
  return { key: PROFILE_MARKER_KEY, source: 'perfil', canonical: true, ruta: clean(ruta) };
}

function samePerson(item, id) {
  const ref = clean(id);
  return [item?.idPersoa, item?.id, item?.rowId].some((value) => clean(value) === ref);
}

function withMarker(payload, id, ruta = '') {
  if (!payload?.persoas || !Array.isArray(payload.persoas)) return payload;
  const info = marker(ruta);
  return {
    ...payload,
    persoas: payload.persoas.map((item) => samePerson(item, id) ? { ...item, fotoR2: info } : item)
  };
}

async function ensureMarker(env, id, ruta = '') {
  if (!env.R2_PRIVADO?.put) return;
  const current = await readJson(env, indexKey(env));
  const next = {
    version: 2,
    actualizadaEn: new Date().toISOString(),
    persoas: { ...(current?.persoas || {}), [id]: marker(ruta) }
  };
  await env.R2_PRIVADO.put(indexKey(env), JSON.stringify(next), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
}

async function refreshCaches(env, id, ruta = '') {
  if (!env.R2_PRIVADO?.get || !env.R2_PRIVADO?.put) return;
  const now = Date.now();
  const snapshot = await readJson(env, snapshotKey(env));
  if (snapshot?.payload?.persoas) {
    await env.R2_PRIVADO.put(snapshotKey(env), JSON.stringify({
      ...snapshot,
      savedAt: now,
      payload: withMarker(snapshot.payload, id, ruta)
    }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });
  }

  const perfis = await readJson(env, perfisKey(env));
  if (perfis?.persoas && Array.isArray(perfis.persoas)) {
    await env.R2_PRIVADO.put(perfisKey(env), JSON.stringify({
      ...perfis,
      savedAt: now,
      persoas: perfis.persoas.map((item) => samePerson(item, id) ? { ...item, fotoR2: marker(ruta) } : item)
    }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });
  }

  if (!env.R2_PRIVADO?.list) return;
  let cursor;
  do {
    const listed = await env.R2_PRIVADO.list({ prefix: ADMIN_CACHE_PREFIX, cursor, limit: 250 });
    for (const item of listed.objects || []) {
      const current = await readJson(env, item.key);
      if (!current?.payload?.persoas) continue;
      await env.R2_PRIVADO.put(item.key, JSON.stringify({
        ...current,
        savedAt: now,
        payload: withMarker(current.payload, id, ruta)
      }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}

function responseFromDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(clean(dataUrl));
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': match[1] || 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'X-SCPP-Photo-Source': 'Perfil'
    }
  });
}

async function readJsonRequest(request) {
  try { return await request.json(); } catch { return null; }
}

async function handleJson(context, user, data) {
  const action = clean(data?.accion || 'obter');
  const id = safeId(data?.idPersoa || data?.id || data?.rowId);
  if (!id) return json(400, { ok: false, erro: 'Non se indicou a persoa.' });

  const write = action === 'eliminar';
  const access = await contextFor(context.env, user, write);
  if (!access.allowed) return json(403, { ok: false, erro: write ? 'Non tes permiso de escritura en Persoas.' : 'Non tes permiso de lectura en Persoas.' });

  const appsAction = action === 'eliminar' ? 'persoasV2FotoPerfilEliminar' : 'persoasV2FotoPerfilObter';
  const result = await callAppsScript(context.env, user, appsAction, { idPersoa: id });
  if (!result?.ok) {
    const status = result?.codigo === 'ADMIN_REQUIRED' || result?.codigo === 'WRITE_REQUIRED' ? 403 : 400;
    return json(status, { ...result, ok: false });
  }

  await ensureMarker(context.env, id, result.ruta || '');
  await refreshCaches(context.env, id, result.ruta || '');

  if (action === 'obter') {
    return json(200, { ok: true, disponible: result.disponible === true, foto: marker(result.ruta || ''), aviso: result.aviso || '' });
  }

  if (action === 'descargar') {
    if (result.disponible !== true || !result.dataUrl) return json(404, { ok: false, erro: result.aviso || 'Esta persoa non ten fotografía de perfil.' });
    return responseFromDataUrl(result.dataUrl) || json(502, { ok: false, erro: 'A fotografía de Perfil non ten un formato válido.' });
  }

  if (action === 'eliminar') {
    return json(200, { ok: true, eliminada: true, foto: marker(''), cacheActualizada: true });
  }

  return json(400, { ok: false, erro: 'Acción de fotografía non permitida.' });
}

async function handleUpload(context, form) {
  const user = await verificarFirebase(form.get('idToken'), context.env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });
  const access = await contextFor(context.env, user, true).catch(() => ({ allowed: false }));
  if (!access.allowed) return json(403, { ok: false, erro: 'Non tes permiso de escritura no módulo Persoas.' });

  const id = safeId(form.get('idPersoa'));
  if (!id) return json(400, { ok: false, erro: 'Non se indicou a persoa.' });
  const file = form.get('foto');
  if (!(file instanceof File)) return json(400, { ok: false, erro: 'Selecciona unha fotografía.' });
  const mimeType = clean(file.type).toLowerCase();
  if (!ALLOWED_TYPES.has(mimeType)) return json(415, { ok: false, erro: 'A fotografía debe ser JPG, PNG ou WebP.' });
  if (!file.size || file.size > MAX_BYTES) return json(413, { ok: false, erro: 'A fotografía non pode superar 2 MB.' });

  const result = await callAppsScript(context.env, user, 'persoasV2FotoPerfilGardar', {
    idPersoa: id,
    fotoTipo: mimeType,
    fotoBase64: bytesToBase64(await file.arrayBuffer())
  });
  if (!result?.ok) {
    const status = result?.codigo === 'ADMIN_REQUIRED' || result?.codigo === 'WRITE_REQUIRED' ? 403 : 400;
    return json(status, { ...result, ok: false });
  }

  await ensureMarker(context.env, id, result.ruta || '');
  await refreshCaches(context.env, id, result.ruta || '');
  return json(200, {
    ok: true,
    disponible: true,
    foto: marker(result.ruta || ''),
    cacheActualizada: true,
    fonte: 'Perfil'
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!context.env.FIREBASE_API_KEY || !context.env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'O servizo de fotografía de Persoas non está configurado.' });
  }

  const contentType = clean(context.request.headers.get('content-type')).toLowerCase();
  if (contentType.startsWith('multipart/form-data')) {
    const form = await context.request.formData().catch(() => null);
    if (!form) return json(400, { ok: false, erro: 'Non foi posible ler a fotografía.' });
    return handleUpload(context, form);
  }

  const data = await readJsonRequest(context.request);
  if (!data) return json(400, { ok: false, erro: 'Solicitude JSON non válida.' });
  const user = await verificarFirebase(data.idToken, context.env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });
  return handleJson(context, user, data);
}
