const TOKEN_PREFIX = 'persoas/revisions/';
const PHOTO_PREFIX = 'persoas/fotos/';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
});

function cleanToken(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : '';
}

function safeId(value) {
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
}

function tokenKey(token) {
  return `${TOKEN_PREFIX}${token}.json`;
}

function photoIndexKey(idPersoa) {
  return `${PHOTO_PREFIX}${safeId(idPersoa)}/latest.json`;
}

async function readInvitation(env, token) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(tokenKey(token));
  if (!object) return null;
  const invitation = await object.json().catch(() => null);
  if (!invitation || invitation.token !== token) return null;
  if (invitation.estado !== 'PENDENTE') return null;
  if (!invitation.idPersoa || Date.parse(String(invitation.caducaEn || '')) <= Date.now()) return null;
  return invitation;
}

async function readIndex(env, idPersoa) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(photoIndexKey(idPersoa));
  if (!object) return null;
  return object.json().catch(() => null);
}

async function handleGet(context) {
  const url = new URL(context.request.url);
  const token = cleanToken(url.searchParams.get('token'));
  if (!token) return json(400, { ok: false, erro: 'A ligazón non é válida.' });
  const invitation = await readInvitation(context.env, token);
  if (!invitation) return json(404, { ok: false, erro: 'A revisión non está dispoñible.' });
  const index = await readIndex(context.env, invitation.idPersoa);
  if (!index?.key) return json(200, { ok: true, disponible: false });
  if (url.searchParams.get('download') !== '1') return json(200, { ok: true, disponible: true, mimeType: String(index.mimeType || ''), actualizadaEn: String(index.actualizadaEn || '') });
  const object = await context.env.R2_PRIVADO.get(String(index.key));
  if (!object) return json(404, { ok: false, erro: 'A fotografía xa non está dispoñible.' });
  return new Response(object.body, { status: 200, headers: { 'Content-Type': String(index.mimeType || object.httpMetadata?.contentType || 'application/octet-stream'), 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' } });
}

async function handlePost(context) {
  const contentType = String(context.request.headers.get('content-type') || '');
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) return json(415, { ok: false, erro: 'Formato de subida non admitido.' });
  const form = await context.request.formData().catch(() => null);
  if (!form) return json(400, { ok: false, erro: 'Non foi posible ler a fotografía.' });
  const token = cleanToken(form.get('token'));
  if (!token) return json(400, { ok: false, erro: 'A ligazón non é válida.' });
  const invitation = await readInvitation(context.env, token);
  if (!invitation) return json(404, { ok: false, erro: 'A revisión non está dispoñible.' });
  const file = form.get('foto');
  if (!(file instanceof File)) return json(400, { ok: false, erro: 'Selecciona unha fotografía.' });
  const mimeType = String(file.type || '').toLowerCase();
  const extension = ALLOWED_TYPES.get(mimeType);
  if (!extension) return json(415, { ok: false, erro: 'A fotografía debe ser JPG, PNG ou WebP.' });
  if (!file.size || file.size > MAX_BYTES) return json(413, { ok: false, erro: 'A fotografía non pode superar 5 MB.' });
  if (!context.env.R2_PRIVADO || typeof context.env.R2_PRIVADO.put !== 'function') return json(503, { ok: false, erro: 'O almacenamento privado non está dispoñible.' });
  const idPersoa = safeId(invitation.idPersoa);
  const key = `${PHOTO_PREFIX}${idPersoa}/actual.${extension}`;
  const now = new Date().toISOString();
  const buffer = await file.arrayBuffer();
  await context.env.R2_PRIVADO.put(key, buffer, { httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' }, customMetadata: { idPersoa, revisionId: safeId(invitation.revisionId || ''), actualizadaEn: now } });
  await context.env.R2_PRIVADO.put(photoIndexKey(idPersoa), JSON.stringify({ key, mimeType, size: file.size, actualizadaEn: now, revisionId: String(invitation.revisionId || '') }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });
  return json(200, { ok: true, disponible: true, mimeType, actualizadaEn: now });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return handleGet(context);
  if (context.request.method === 'POST') return handlePost(context);
  return json(405, { ok: false, erro: 'Método non permitido.' });
}
