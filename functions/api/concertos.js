import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

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

function respostaFicheiro(resultado) {
  const base64 = String(resultado.base64 || '');
  if (!base64) return json(502, { ok: false, erro: 'O documento chegou baleiro' });

  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);

  const nome = String(resultado.nomeFicheiro || 'programa-concerto')
    .replace(/[\r\n"]/g, '');

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': String(resultado.mimeType || 'application/octet-stream'),
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try {
    usuario = await verificarTokenFirebase(
      String(datos.idToken || '').trim(),
      env.FIREBASE_API_KEY
    );
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }

  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const accion = String(datos.accion || '').trim();
  if (accion !== 'obterDocumentoConcerto') {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  const concertoId = String(datos.concertoId || '').trim();
  if (!concertoId || concertoId.length > 120) {
    return json(400, { ok: false, erro: 'O concerto indicado non é válido' });
  }

  try {
    const { resultado, usouRespaldo } = await obterJsonAppsScript(
      env,
      {
        token: env.WEB_WRITE_TOKEN,
        accion,
        email: usuario.email,
        uidFirebase: usuario.uid,
        concertoId
      },
      { timeoutMs: 45_000, attemptTimeoutMs: 15_000 }
    );

    if (!resultado?.ok) {
      const estado = resultado?.erro === 'Usuario non autorizado' ? 403 : 400;
      return json(estado, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible abrir o documento do concerto.'
      });
    }

    const resposta = respostaFicheiro(resultado);
    if (usouRespaldo) resposta.headers.set('X-SCPP-AppScript', 'FALLBACK');
    return resposta;
  } catch (erro) {
    console.error('Erro no servizo de concertos:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: 'O documento do concerto non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
