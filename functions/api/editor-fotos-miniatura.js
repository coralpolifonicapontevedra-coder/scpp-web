const INDEX_KEY = 'indices/revision-fotos-v1.json';
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  if (!idToken || !apiKey) return null;
  const resposta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return String(usuario.email).trim().toLowerCase();
}

async function claveCorreo(email) {
  const datos = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)]
    .map((valor) => valor.toString(16).padStart(2, '0'))
    .join('');
}

async function administracionCacheada(env, email) {
  if (!env.R2_PRIVADO || !email) return false;
  const clave = await claveCorreo(email);
  const obxecto = await env.R2_PRIVADO.get(`cache/autorizacion-fotos/${clave}.json`);
  if (!obxecto) return false;
  const datos = await obxecto.json().catch(() => null);
  const verificadaEn = Date.parse(String(datos?.verificadaEn || ''));
  return datos?.administrador === true && Number.isFinite(verificadaEn) &&
    Date.now() - verificadaEn < AUTH_TTL_MS;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.R2_PRIVADO || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo de miniaturas non está configurado.' });
  }

  const url = new URL(request.url);
  const idFoto = String(url.searchParams.get('idFoto') || '').trim();
  const token = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!idFoto || !token) return json(400, { ok: false, erro: 'Faltan datos da fotografía.' });

  const email = await verificarTokenFirebase(token, env.FIREBASE_API_KEY).catch(() => null);
  if (!email) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await administracionCacheada(env, email))) {
    return json(403, { ok: false, erro: 'Administración non autorizada.' });
  }

  const obxectoIndice = await env.R2_PRIVADO.get(INDEX_KEY);
  if (!obxectoIndice) return json(404, { ok: false, erro: 'O índice de revisión non está dispoñible.' });
  const indice = await obxectoIndice.json().catch(() => null);
  const foto = Array.isArray(indice?.fotos)
    ? indice.fotos.find((item) => String(item?.idFoto || item?.rowId || '').trim() === idFoto)
    : null;
  const ruta = String(foto?.rutaMiniaturaRevision || foto?.rutaMiniatura || '').trim();
  if (!ruta) return json(404, { ok: false, erro: 'A miniatura non está dispoñible.' });

  const miniatura = await env.R2_PRIVADO.get(ruta);
  if (!miniatura) return json(404, { ok: false, erro: 'A miniatura non existe en R2.' });

  const headers = new Headers();
  miniatura.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'image/webp');
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('ETag', miniatura.httpEtag || `"${idFoto}"`);
  headers.set('X-SCPP-Photo-Source', 'R2-REVIEW-THUMBNAIL');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(miniatura.body, { status: 200, headers });
}
