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
const SNAPSHOT_MAIN = 'persoas/cache/snapshot-v4.json';
const SNAPSHOT_PREVIEW = 'persoas/cache/preview/snapshot-v4.json';
const PERFIS_MAIN = 'persoas/cache/perfis.json';
const PERFIS_PREVIEW = 'persoas/cache/preview/perfis.json';
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';

const clean = (value) => String(value == null ? '' : value).trim();
const safeId = (value) => clean(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
const branch = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const indexKey = (env) => branch(env) === 'main' ? PHOTO_INDEX_MAIN : PHOTO_INDEX_PREVIEW;
const snapshotKey = (env) => branch(env) === 'main' ? SNAPSHOT_MAIN : SNAPSHOT_PREVIEW;
const perfisKey = (env) => branch(env) === 'main' ? PERFIS_MAIN : PERFIS_PREVIEW;
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

async function readJson(env, key) {
  if (!env.R2_PRIVADO?.get) return null;
  const object = await env.R2_PRIVADO.get(key);
  return object ? object.json().catch(() => null) : null;
}

async function readIndex(env) {
  const value = await readJson(env, indexKey(env));
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

function samePerson(item, id) {
  const ref = clean(id);
  return [item?.idPersoa, item?.id, item?.rowId].some((value) => clean(value) === ref);
}

function withPhoto(payload, id, info) {
  if (!payload?.persoas || !Array.isArray(payload.persoas)) return payload;
  return {
    ...payload,
    persoas: payload.persoas.map((item) => samePerson(item, id) ? { ...item, fotoR2: info || null } : item)
  };
}

async function refreshPhotoCaches(env, id, info) {
  if (!env.R2_PRIVADO?.get || !env.R2_PRIVADO?.put) return;
  const now = Date.now();

  const snapshot = await readJson(env, snapshotKey(env));
  if (snapshot?.payload?.persoas) {
    await env.R2_PRIVADO.put(snapshotKey(env), JSON.stringify({
      ...snapshot,
      savedAt: now,
      payload: withPhoto(snapshot.payload, id, info)
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
    });
  }

  const perfis = await readJson(env, perfisKey(env));
  if (perfis?.persoas && Array.isArray(perfis.persoas)) {
    await env.R2_PRIVADO.put(perfisKey(env), JSON.stringify({
      ...perfis,
      savedAt: now,
      persoas: perfis.persoas.map((item) => samePerson(item, id) ? { ...item, fotoR2: info || null } : item)
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
    });
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
        payload: withPhoto(current.payload, id, info)
      }), {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
      });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
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
    await refreshPhotoCaches(context.env, id, null);
    return json(200, { ok: true, eliminada: true, cacheActualizada: true });
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
  await refreshPhotoCaches(context.env, id, info);
  return json(200, { ok: true, disponible: true, foto: info, cacheActualizada: true });
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
