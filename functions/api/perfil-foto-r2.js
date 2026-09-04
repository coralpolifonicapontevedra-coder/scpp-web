const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);
const PERFIS_MAIN = 'persoas/cache/perfis.json';
const PERFIS_PREVIEW = 'persoas/cache/preview/perfis.json';
const PHOTO_INDEX_MAIN = 'persoas/fotos/index.json';
const PHOTO_INDEX_PREVIEW = 'persoas/fotos/preview/index.json';
const SNAPSHOT_MAIN = 'persoas/cache/snapshot-v4.json';
const SNAPSHOT_PREVIEW = 'persoas/cache/preview/snapshot-v4.json';
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';

const clean = (value) => String(value == null ? '' : value).trim();
const branch = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const perfisKey = (env) => branch(env) === 'main' ? PERFIS_MAIN : PERFIS_PREVIEW;
const photoIndexKey = (env) => branch(env) === 'main' ? PHOTO_INDEX_MAIN : PHOTO_INDEX_PREVIEW;
const snapshotKey = (env) => branch(env) === 'main' ? SNAPSHOT_MAIN : SNAPSHOT_PREVIEW;
const prefix = (env, id) => branch(env) === 'main' ? `persoas/fotos/${id}/` : `persoas/fotos/preview/${id}/`;
const safeId = (value) => clean(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);

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
  const object = await env.R2_PRIVADO?.get?.(key);
  return object ? object.json().catch(() => null) : null;
}

function normalNif(value) {
  return clean(value).replace(/\s+/g, '').toUpperCase();
}

function normalName(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function refs(item) {
  return Array.from(new Set([item?.idPersoa, item?.id, item?.rowId].map(clean).filter(Boolean)));
}

function unique(items) {
  return Array.isArray(items) && items.length === 1 ? items[0] : null;
}

function emailOf(item) {
  return clean(item?.correoElectronico || item?.correo || item?.email).toLowerCase();
}

async function resolveOwnPerson(env, user, hint = {}) {
  const index = await readJson(env, perfisKey(env));
  const people = Array.isArray(index?.persoas) ? index.persoas : [];
  if (!people.length) return null;

  const hintedIds = refs(hint);
  if (hintedIds.length) {
    const direct = people.find((item) => refs(item).some((id) => hintedIds.includes(id)));
    if (direct && (emailOf(direct) === user.email || !emailOf(direct))) return direct;
  }

  const byLogin = unique(people.filter((item) => emailOf(item) === user.email));
  if (byLogin) return byLogin;

  const contact = clean(hint?.correoElectronico || hint?.correo).toLowerCase();
  if (contact) {
    const byContact = unique(people.filter((item) => emailOf(item) === contact));
    if (byContact) return byContact;
  }

  const nif = normalNif(hint?.nif);
  if (nif) {
    const byNif = unique(people.filter((item) => normalNif(item?.nif) === nif));
    if (byNif) return byNif;
  }

  const name = normalName(hint?.nomeCompleto || [hint?.nome, hint?.primeiroApelido, hint?.segundoApelido].filter(Boolean).join(' '));
  if (name) {
    const byName = unique(people.filter((item) => normalName(item?.nomeCompleto || [item?.nome, item?.primeiroApelido, item?.segundoApelido].filter(Boolean).join(' ')) === name));
    if (byName) return byName;
  }
  return null;
}

function validStoredPhoto(info) {
  const key = clean(info?.key);
  return Boolean(key && key !== '__perfil__' && key.startsWith('persoas/fotos/'));
}

async function readPhotoIndex(env) {
  const value = await readJson(env, photoIndexKey(env));
  return value?.persoas && typeof value.persoas === 'object' ? value : { version: 3, persoas: {} };
}

async function savePhotoIndex(env, index) {
  await env.R2_PRIVADO.put(photoIndexKey(env), JSON.stringify({
    version: 3,
    actualizadaEn: new Date().toISOString(),
    persoas: index?.persoas || {}
  }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });
}

function samePerson(item, idSet) {
  return refs(item).some((id) => idSet.has(id));
}

function withPhoto(payload, idSet, info) {
  if (!Array.isArray(payload?.persoas)) return payload;
  return {
    ...payload,
    persoas: payload.persoas.map((item) => samePerson(item, idSet) ? { ...item, fotoR2: info || null } : item)
  };
}

async function refreshCaches(env, idSet, info) {
  const now = Date.now();
  const snapshot = await readJson(env, snapshotKey(env));
  if (snapshot?.payload?.persoas) {
    await env.R2_PRIVADO.put(snapshotKey(env), JSON.stringify({
      ...snapshot,
      savedAt: now,
      payload: withPhoto(snapshot.payload, idSet, info)
    }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });
  }

  const perfis = await readJson(env, perfisKey(env));
  if (Array.isArray(perfis?.persoas)) {
    await env.R2_PRIVADO.put(perfisKey(env), JSON.stringify({
      ...perfis,
      savedAt: now,
      persoas: perfis.persoas.map((item) => samePerson(item, idSet) ? { ...item, fotoR2: info || null } : item)
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
        payload: withPhoto(current.payload, idSet, info)
      }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

function decodeBase64(base64) {
  const binary = atob(clean(base64));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function storePhoto(env, person, base64, mimeType, user) {
  const type = clean(mimeType).toLowerCase();
  const extension = ALLOWED_TYPES.get(type);
  const id = safeId(person?.idPersoa || person?.id || person?.rowId);
  if (!id || !extension) throw new Error('A fotografía non ten un formato válido.');
  const bytes = decodeBase64(base64);
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error('A fotografía de perfil supera o máximo permitido.');

  const ids = new Set(refs(person).map(safeId).filter(Boolean));
  ids.add(id);
  const index = await readPhotoIndex(env);
  const previous = Array.from(ids).map((ref) => index.persoas[ref]).find(validStoredPhoto) || null;
  const key = `${prefix(env, id)}actual.${extension}`;
  const now = new Date().toISOString();

  if (previous?.key && previous.key !== key && env.R2_PRIVADO?.delete) await env.R2_PRIVADO.delete(previous.key);
  await env.R2_PRIVADO.put(key, bytes, {
    httpMetadata: { contentType: type, cacheControl: 'private, no-store' },
    customMetadata: { idPersoa: id, actualizadaEn: now, subidaPor: user.email }
  });
  const info = { key, mimeType: type, size: bytes.byteLength, actualizadaEn: now, subidaPor: user.email, source: 'r2', canonical: true };
  await env.R2_PRIVADO.put(`${prefix(env, id)}latest.json`, JSON.stringify(info), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
  for (const ref of ids) index.persoas[ref] = info;
  await savePhotoIndex(env, index);
  await refreshCaches(env, ids, info);
  return info;
}

async function servePhoto(env, person) {
  const index = await readPhotoIndex(env);
  const info = refs(person).map((id) => index.persoas[safeId(id)]).find(validStoredPhoto) || null;
  if (!info) return json(404, { ok: false, erro: 'A fotografía aínda non está en R2.' });
  const object = await env.R2_PRIVADO.get(info.key);
  if (!object) return json(404, { ok: false, erro: 'A fotografía xa non está dispoñible en R2.' });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', clean(info.mimeType) || headers.get('Content-Type') || 'image/jpeg');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Disposition', 'inline');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Photo-Source', 'R2');
  return new Response(object.body, { status: 200, headers });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!context.env.FIREBASE_API_KEY || !context.env.R2_PRIVADO?.get || !context.env.R2_PRIVADO?.put) {
    return json(500, { ok: false, erro: 'O servizo de fotografía de Perfil non está configurado.' });
  }

  let data;
  try { data = await context.request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  const user = await verificarFirebase(data?.idToken, context.env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });

  const person = await resolveOwnPerson(context.env, user, data?.perfil || {});
  if (!person) return json(404, { ok: false, erro: 'Non foi posible identificar a túa ficha de Persoas.' });

  const action = clean(data?.accion || 'descargar');
  if (action === 'descargar') return servePhoto(context.env, person);
  if (action === 'gardar') {
    const mimeType = clean(data?.fotoTipo).toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) return json(415, { ok: false, erro: 'A fotografía debe ser JPG, PNG ou WebP.' });
    const base64 = clean(data?.fotoBase64);
    if (!base64) return json(400, { ok: false, erro: 'Non se recibiu a fotografía.' });
    try {
      const info = await storePhoto(context.env, person, base64, mimeType, user);
      return json(200, { ok: true, foto: info, idPersoa: clean(person.idPersoa || person.id || person.rowId), fonte: 'R2' });
    } catch (error) {
      return json(400, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible gardar a fotografía.' });
    }
  }
  return json(400, { ok: false, erro: 'Acción non permitida.' });
}
