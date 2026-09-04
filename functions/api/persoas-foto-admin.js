import { obterPermisoPortal } from '../_lib/portal-permissions.js';

const MODULO = 'persoas';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);
const PHOTO_INDEX_MAIN = 'persoas/fotos/index.json';
const PHOTO_INDEX_PREVIEW = 'persoas/fotos/preview/index.json';

const clean = (value) => String(value == null ? '' : value).trim();
const safeId = (value) => clean(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
const branch = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const indexKey = (env) => branch(env) === 'main' ? PHOTO_INDEX_MAIN : PHOTO_INDEX_PREVIEW;
const prefix = (env, id) => branch(env) === 'main' ? `persoas/fotos/${id}/` : `persoas/fotos/preview/${id}/`;

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

async function readIndex(env) {
  if (!env.R2_PRIVADO?.get) return { version: 1, persoas: {} };
  const object = await env.R2_PRIVADO.get(indexKey(env));
  const value = object ? await object.json().catch(() => null) : null;
  return value?.persoas && typeof value.persoas === 'object' ? value : { version: 1, persoas: {} };
}

async function saveIndex(env, index) {
  await env.R2_PRIVADO.put(indexKey(env), JSON.stringify({
    version: 1,
    actualizadaEn: new Date().toISOString(),
    persoas: index?.persoas || {}
  }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
}

async function contextFor(env, user, write = false) {
  const permiso = await obterPermisoPortal(env, user, MODULO);
  const allowed = write ? permiso?.podeEscribir : permiso?.podeLer;
  return { permiso, allowed: Boolean(allowed) };
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
  if (!context.env.R2_PRIVADO?.get) return json(503, { ok: false, erro: 'R2 privado non está dispoñible.' });

  const index = await readIndex(context.env);
  const info = index.persoas[id] || null;

  if (action === 'obter') {
    return json(200, { ok: true, disponible: Boolean(info?.key), foto: info });
  }

  if (action === 'descargar') {
    if (!info?.key) return json(404, { ok: false, erro: 'Esta persoa non ten fotografía en R2.' });
    const object = await context.env.R2_PRIVADO.get(info.key);
    if (!object) return json(404, { ok: false, erro: 'A fotografía xa non está dispoñible.' });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', clean(info.mimeType) || headers.get('Content-Type') || 'application/octet-stream');
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Content-Disposition', 'inline');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { status: 200, headers });
  }

  if (action === 'eliminar') {
    if (info?.key && context.env.R2_PRIVADO.delete) await context.env.R2_PRIVADO.delete(info.key);
    if (context.env.R2_PRIVADO.delete) await context.env.R2_PRIVADO.delete(`${prefix(context.env, id)}latest.json`);
    delete index.persoas[id];
    await saveIndex(context.env, index);
    return json(200, { ok: true, eliminada: true });
  }

  return json(400, { ok: false, erro: 'Acción de fotografía non permitida.' });
}

async function handleUpload(context, form) {
  const user = await verificarFirebase(form.get('idToken'), context.env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });
  const access = await contextFor(context.env, user, true).catch(() => ({ allowed: false }));
  if (!access.allowed) return json(403, { ok: false, erro: 'Non tes permiso de escritura no módulo Persoas.' });
  if (!context.env.R2_PRIVADO?.put) return json(503, { ok: false, erro: 'R2 privado non está dispoñible.' });

  const id = safeId(form.get('idPersoa'));
  if (!id) return json(400, { ok: false, erro: 'Non se indicou a persoa.' });
  const file = form.get('foto');
  if (!(file instanceof File)) return json(400, { ok: false, erro: 'Selecciona unha fotografía.' });
  const mimeType = clean(file.type).toLowerCase();
  const extension = ALLOWED_TYPES.get(mimeType);
  if (!extension) return json(415, { ok: false, erro: 'A fotografía debe ser JPG, PNG ou WebP.' });
  if (!file.size || file.size > MAX_BYTES) return json(413, { ok: false, erro: 'A fotografía non pode superar 5 MB.' });

  const globalIndex = await readIndex(context.env);
  const previous = globalIndex.persoas[id];
  const key = `${prefix(context.env, id)}actual.${extension}`;
  const now = new Date().toISOString();
  if (previous?.key && previous.key !== key && context.env.R2_PRIVADO.delete) {
    await context.env.R2_PRIVADO.delete(previous.key);
  }
  await context.env.R2_PRIVADO.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' },
    customMetadata: { idPersoa: id, actualizadaEn: now, subidaPor: user.email }
  });
  const info = { key, mimeType, size: file.size, actualizadaEn: now, subidaPor: user.email };
  await context.env.R2_PRIVADO.put(`${prefix(context.env, id)}latest.json`, JSON.stringify(info), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
  globalIndex.persoas[id] = info;
  await saveIndex(context.env, globalIndex);
  return json(200, { ok: true, disponible: true, foto: info });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!context.env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'Firebase non está configurado.' });

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
