import { obterJsonAppsScript } from '../_lib/apps-script.js';

const AUTH_TTL_MS = 15 * 60 * 1000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
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

  if (gardada) {
    const datos = await gardada.json().catch(() => null);
    const verificadaEn = Date.parse(String(datos?.verificadaEn || ''));
    if (datos?.administrador === true && Number.isFinite(verificadaEn) && Date.now() - verificadaEn < AUTH_TTL_MS) {
      return true;
    }
  }

  if (!env.WEB_WRITE_TOKEN) return false;
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });

  if (!resultado?.ok) return false;
  await env.R2_PRIVADO.put(ruta, JSON.stringify({
    administrador: true,
    email: usuario.email,
    verificadaEn: new Date().toISOString()
  }), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, max-age=900'
    }
  });
  return true;
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

  const indice = await env.R2_PRIVADO.get(`fotos/traballo/${idFoto}.json`);
  if (!indice) {
    return json(404, { ok: false, erro: 'A fotografía aínda non está preparada en R2.' });
  }
  const datos = await indice.json().catch(() => null);
  const ruta = String(datos?.ruta || '').trim();
  if (!ruta) {
    return json(404, { ok: false, erro: 'A ruta privada da fotografía non é válida.' });
  }

  const obxecto = await env.R2_PRIVADO.get(ruta);
  if (!obxecto) {
    return json(404, { ok: false, erro: 'A fotografía non está dispoñible en R2.' });
  }

  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || String(datos?.mimeType || 'image/jpeg'));
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('ETag', obxecto.httpEtag || `"${idFoto}"`);
  headers.set('X-SCPP-Photo-Source', 'R2-BINARY');
  return new Response(obxecto.body, { status: 200, headers });
}
