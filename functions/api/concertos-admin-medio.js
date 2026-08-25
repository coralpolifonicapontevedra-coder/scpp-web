const TIMEOUT_FIREBASE_MS = 8_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const TIPOS_MEDIO = {
  cartel: new Set(['image/jpeg', 'image/png', 'image/webp']),
  triptico: new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
};
const MAX_MEDIO_BYTES = 12 * 1024 * 1024;
const INDEX_MAIN = 'indices/concertos-privado-v1.json';
const INDEX_PREVIEW = 'indices/preview/concertos-privado-v1.json';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const clean = (value) => String(value ?? '').trim();
const contorno = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const indexKey = (env) => contorno(env) === 'main' ? INDEX_MAIN : INDEX_PREVIEW;

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_FIREBASE_MS);
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = (await response.json())?.users?.[0];
    if (!data?.email || data.emailVerified !== true) return null;
    return {
      uid: clean(data.localId),
      email: clean(data.email).toLowerCase()
    };
  } finally {
    clearTimeout(timer);
  }
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

function bytesBase64(value) {
  const bin = atob(String(value || ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function extensionMedio(mime) {
  return {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf'
  }[mime] || 'bin';
}

async function prepararIndice(env, idConcerto, tipo) {
  const key = indexKey(env);
  const object = await env.R2_PRIVADO.get(key);
  if (!object) throw Object.assign(new Error('O índice privado de concertos non está dispoñible.'), { code:'R2_CONCERT_INDEX_MISSING' });
  const current = await object.json().catch(() => null);
  if (!current?.ok || !Array.isArray(current.concertos)) {
    throw Object.assign(new Error('O índice privado de concertos non ten un formato válido.'), { code:'R2_CONCERT_INDEX_INVALID' });
  }
  const pos = current.concertos.findIndex((c) => clean(c.id) === idConcerto);
  if (pos < 0) throw Object.assign(new Error('Non se atopou o concerto no índice R2 deste contorno.'), { code:'R2_CONCERT_NOT_FOUND' });
  return { key, current, pos, tipo };
}

async function gardarRutaNoIndice(env, preparado, ruta) {
  const concertos = preparado.current.concertos.slice();
  concertos[preparado.pos] = { ...concertos[preparado.pos], [preparado.tipo]: ruta };
  await env.R2_PRIVADO.put(preparado.key, JSON.stringify({
    ...preparado.current,
    concertos,
    xeradoEn: new Date().toISOString(),
    xeradoEnMs: Date.now(),
    actualizadoDesde: 'ADMIN-CONCERTOS-MEDIO-ILLADO'
  }), {
    httpMetadata: { contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' },
    customMetadata: { tipo:'indice-concertos-privado', version:'1' }
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (!env.R2_PRIVADO?.get || !env.R2_PRIVADO?.put || !env.FIREBASE_API_KEY) {
    return json(500, { ok:false, erro:'O servizo de medios non está configurado correctamente.' });
  }

  let body;
  try { body = await request.json(); }
  catch { return json(400, { ok:false, erro:'Solicitude non válida.' }); }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok:false, erro:'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user))) {
    return json(403, { ok:false, erro:'Usuario non autorizado para Administración.' });
  }

  const idConcerto = clean(body.idConcerto);
  const tipo = clean(body.tipo);
  const mimeType = clean(body.mimeType);
  const base64 = String(body.base64 || '');
  if (body.accion !== 'subirMedio' || !idConcerto || !TIPOS_MEDIO[tipo]?.has(mimeType) || !base64) {
    return json(400, { ok:false, erro:'Selecciona un ficheiro válido.' });
  }

  let bytes;
  try { bytes = bytesBase64(base64); }
  catch { return json(400, { ok:false, erro:'O contido do ficheiro non é válido.' }); }
  if (bytes.length > MAX_MEDIO_BYTES) return json(413, { ok:false, erro:'O ficheiro supera o límite de 12 MB.' });

  try {
    const preparado = await prepararIndice(env, idConcerto, tipo);
    const ambito = contorno(env);
    const prefix = `concertos/admin/${ambito}/${encodeURIComponent(idConcerto)}/${tipo}/`;
    const existentes = await env.R2_PRIVADO.list({ prefix });
    for (const object of existentes.objects || []) await env.R2_PRIVADO.delete(object.key);

    const key = `${prefix}${Date.now()}.${extensionMedio(mimeType)}`;
    await env.R2_PRIVADO.put(key, bytes, {
      httpMetadata: { contentType:mimeType, cacheControl:'private, max-age=300' },
      customMetadata: { idConcerto, tipo, contorno:ambito, subidoPor:user.email }
    });

    const ruta = `r2://${key}`;
    await gardarRutaNoIndice(env, preparado, ruta);
    return json(200, {
      ok:true,
      ruta,
      almacen:'R2',
      contorno:ambito,
      sheetSincronizada:false
    });
  } catch (error) {
    const status = error?.code === 'R2_CONCERT_NOT_FOUND' ? 404 : 502;
    return json(status, { ok:false, codigo:error?.code || 'R2_MEDIA', erro:error?.message || 'Non foi posible gardar o ficheiro.' });
  }
}
