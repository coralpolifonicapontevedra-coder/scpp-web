const IDS_AUDIO_DESACTIVADOS = new Set(['18', '35', '52', '67']);
const REVISION_INDEX_PATH = 'indices/revision-fotos-v1.json';
const AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FIREBASE_TIMEOUT_MS = 8 * 1000;
const AUTH_CACHE_VERSION = 2;

function filtrarAudiosDesactivados(resultado) {
  if (!resultado || typeof resultado !== 'object') return resultado;

  const obras = Array.isArray(resultado.obras)
    ? resultado.obras
    : Array.isArray(resultado.repertorio)
      ? resultado.repertorio
      : Array.isArray(resultado.datos)
        ? resultado.datos
        : [];

  for (const obra of obras) {
    if (!obra || typeof obra !== 'object') continue;

    for (const campo of ['audios', 'audiosR2']) {
      if (!Array.isArray(obra[campo])) continue;
      obra[campo] = obra[campo].filter((audio) =>
        !IDS_AUDIO_DESACTIVADOS.has(String(audio?.id ?? '').trim())
      );
    }
  }

  if (resultado.indiceR2 && typeof resultado.indiceR2 === 'object') {
    resultado.indiceR2.audios = obras.reduce(
      (total, obra) => total + (Array.isArray(obra?.audios) ? obra.audios.length : 0),
      0
    );
  }

  return resultado;
}

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    ...headers
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  if (!idToken || !apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIREBASE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return String(user.email).trim().toLowerCase();
}

async function claveCorreo(email) {
  const bytes = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function administracionCacheada(env, email) {
  if (!env.R2_PRIVADO || !email) return false;
  const key = await claveCorreo(email);
  const object = await env.R2_PRIVADO.get(`cache/autorizacion-fotos/${key}.json`);
  if (!object) return false;
  const data = await object.json().catch(() => null);
  const verifiedAt = Date.parse(String(data?.verificadaEn || ''));
  const versionCompatible = data?.version == null || data.version === AUTH_CACHE_VERSION;
  const sameEmail = !data?.email || String(data.email).trim().toLowerCase() === email;
  return versionCompatible && sameEmail &&
    data?.administrador === true && Number.isFinite(verifiedAt) &&
    Date.now() - verifiedAt < AUTH_TTL_MS;
}

async function intentarRevisionR2(context, url) {
  if (
    url.pathname !== '/api/fotos' ||
    context.request.method !== 'POST' ||
    !context.env.R2_PRIVADO ||
    !context.env.FIREBASE_API_KEY
  ) return null;

  let body;
  try {
    body = await context.request.clone().json();
  } catch {
    return null;
  }
  if (String(body?.accion || '') !== 'listarFotosRevision') return null;

  const email = await verificarTokenFirebase(
    String(body?.idToken || '').trim(),
    context.env.FIREBASE_API_KEY
  ).catch(() => null);
  if (!email) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  // A apertura nunca consulta Sheets nin Apps Script. A autorización xa
  // verificada consérvase en R2; se non existe, fallamos de forma explícita.
  if (!(await administracionCacheada(context.env, email))) {
    return json(403, {
      ok: false,
      erro: 'O permiso de revisión non está preparado na caché R2.'
    });
  }

  const object = await context.env.R2_PRIVADO.get(REVISION_INDEX_PATH);
  if (!object) {
    return json(503, {
      ok: false,
      erro: 'O índice de fotografías aínda non está preparado en R2.'
    });
  }
  const index = await object.json().catch(() => null);
  if (!index?.ok || !Array.isArray(index.fotos)) {
    return json(503, {
      ok: false,
      erro: 'O índice de fotografías de R2 non é válido.'
    });
  }

  return json(200, {
    ok: true,
    administrador: true,
    fotos: index.fotos,
    total: index.fotos.length,
    xeradoEn: index.xeradoEn,
    orixe: 'R2-REVISION'
  }, {
    'X-SCPP-Cache': 'R2-HIT',
    'X-SCPP-Review-Index': 'revision-fotos-v1',
    'Server-Timing': 'r2;dur=1'
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  const revisionR2 = await intentarRevisionR2(context, url);
  if (revisionR2) return revisionR2;

  const response = await context.next();

  if (
    url.pathname !== '/api/repertorio' ||
    context.request.method !== 'POST' ||
    !String(response.headers.get('Content-Type') || '').includes('application/json')
  ) {
    return response;
  }

  let resultado;
  try {
    resultado = await response.clone().json();
  } catch {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-SCPP-Audios-Filter', 'desactivados-18-35-52-67');

  return new Response(
    JSON.stringify(filtrarAudiosDesactivados(resultado)),
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
}
