import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_REVISION = 'indices/revision-fotos-v1.json';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
        signal: controller.signal
      }
    );
    if (!response.ok) return null;
    const user = (await response.json())?.users?.[0];
    if (!user?.email || user.emailVerified !== true) return null;
    return {
      uid: String(user.localId || '').trim(),
      email: String(user.email || '').trim().toLowerCase()
    };
  } finally {
    clearTimeout(timer);
  }
}

async function gardarIndiceRevision(env, resultado) {
  const agora = new Date();
  const fotos = Array.isArray(resultado?.fotos) ? resultado.fotos : [];
  const indice = {
    ok: true,
    fotos,
    total: fotos.length,
    xeradoEn: agora.toISOString(),
    xeradoEnMs: agora.getTime(),
    actualizadoDesde: 'SHEET-REFRESH-ADMIN',
    version: '2'
  };

  await env.R2_PRIVADO.put(INDEX_REVISION, JSON.stringify(indice), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, max-age=0, no-cache, must-revalidate'
    }
  });

  return indice;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O refresco de fotografías non está configurado.' });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  const usuario = await verificarTokenFirebase(datos.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  }

  try {
    const inicio = Date.now();
    const { resultado, usouRespaldo } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'listarFotosRevision',
      email: usuario.email,
      uidFirebase: usuario.uid
    }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });

    if (!resultado?.ok) {
      const mensaxe = resultado?.erro || 'Non se puido ler a Sheet de fotografías.';
      const status = /autorizad/i.test(mensaxe) ? 403 : 503;
      return json(status, { ok: false, erro: mensaxe });
    }
    if (Object.prototype.hasOwnProperty.call(resultado, 'administrador') && resultado.administrador !== true) {
      return json(403, { ok: false, erro: 'Administración non autorizada.' });
    }

    const indice = await gardarIndiceRevision(env, resultado);
    return json(200, {
      ok: true,
      total: indice.total,
      xeradoEn: indice.xeradoEn,
      orixe: usouRespaldo ? 'SHEET-FALLBACK' : 'SHEET',
      tempoRespostaMs: Date.now() - inicio
    });
  } catch (error) {
    console.error('Erro ao refrescar fotografías desde a Sheet:', error);
    return json(503, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non se puido refrescar a revisión de fotografías.'
    });
  }
}
