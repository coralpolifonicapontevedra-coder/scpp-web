import { obterJsonAppsScript } from '../_lib/apps-script.js';

const AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_CACHE_VERSION = 2;
const FIREBASE_TIMEOUT_MS = 8 * 1000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIREBASE_TIMEOUT_MS);
  let resposta;
  try {
    resposta = await fetch(
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
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
}

async function claveCorreo(email) {
  const datos = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)]
    .map((valor) => valor.toString(16).padStart(2, '0'))
    .join('');
}

async function comprobarAdministracion(env, usuario) {
  const clave = await claveCorreo(usuario.email);
  const ruta = `cache/autorizacion-fotos/${clave}.json`;
  const gardada = await env.R2_PRIVADO.get(ruta);
  if (!gardada) return false;

  const datos = await gardada.json().catch(() => null);
  const verificadaEn = Date.parse(String(datos?.verificadaEn || ''));
  const versionCompatible = datos?.version == null || datos.version === AUTH_CACHE_VERSION;
  const mesmoCorreo = !datos?.email ||
    String(datos.email).trim().toLowerCase() === usuario.email;
  return versionCompatible && mesmoCorreo &&
    datos?.administrador === true &&
    Number.isFinite(verificadaEn) &&
    Date.now() - verificadaEn < AUTH_TTL_MS;
}

async function resolverRutaActual(env, idFoto) {
  const rutaCanonica = `fotos/borradores/${idFoto}`;
  const canonico = await env.R2_PRIVADO.get(rutaCanonica);
  if (canonico) {
    return {
      obxecto: canonico,
      ruta: rutaCanonica,
      mimeType: '',
      fonte: 'R2-DRAFT-CANONICAL'
    };
  }

  const estadoObj = await env.R2_PRIVADO.get(`fotos/estado-edicion/${idFoto}.json`);
  const estado = estadoObj ? await estadoObj.json().catch(() => null) : null;
  const rutaBorrador = String(estado?.rutaPrivada || '').trim();

  if (rutaBorrador && (estado?.tipo === 'borrador' || estado?.estado === 'sincronizada')) {
    const borrador = await env.R2_PRIVADO.get(rutaBorrador);
    if (borrador) {
      return {
        obxecto: borrador,
        ruta: rutaBorrador,
        mimeType: String(estado?.mimeType || '').trim(),
        fonte: 'R2-DRAFT-POINTER'
      };
    }
  }

  const indiceObj = await env.R2_PRIVADO.get(`fotos/traballo/${idFoto}.json`);
  if (!indiceObj) return null;
  const indice = await indiceObj.json().catch(() => null);
  const ruta = String(indice?.ruta || '').trim();
  if (!ruta) return null;
  const obxecto = await env.R2_PRIVADO.get(ruta);
  if (!obxecto) return null;
  return {
    obxecto,
    ruta,
    mimeType: String(indice?.mimeType || '').trim(),
    fonte: ruta.includes('/borradores/') || ruta.includes('/editadas/') ? 'R2-WORK-DRAFT' : 'R2-WORK-ORIGINAL'
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  }

  const url = new URL(request.url);
  const idFoto = String(url.searchParams.get('idFoto') || '').trim();
  const authorization = String(request.headers.get('Authorization') || '');
  const idToken = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!idFoto || !idToken) {
    return json(400, { ok: false, erro: 'Faltan datos da fotografía.' });
  }

  const usuario = await verificarTokenFirebase(idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  }
  if (!(await comprobarAdministracion(env, usuario))) {
    return json(403, { ok: false, erro: 'Administración non autorizada.' });
  }

  const actual = await resolverRutaActual(env, idFoto);
  if (!actual) {
    return json(404, { ok: false, erro: 'A fotografía non está dispoñible en R2.' });
  }

  const headers = new Headers();
  actual.obxecto.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || actual.mimeType || 'image/jpeg');
  headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  headers.set('ETag', actual.obxecto.httpEtag || `"${idFoto}-${Date.now()}"`);
  headers.set('X-SCPP-Photo-Source', actual.fonte);
  headers.set('X-SCPP-Photo-Path', actual.ruta);
  return new Response(actual.obxecto.body, { status: 200, headers });
}
