import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_LISTADO_MS = 25 * 1000;
const TIMEOUT_FICHEIRO_MS = 60 * 1000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
  const resposta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
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
  if (!base64) return json(502, { ok: false, erro: 'A ficha chegou baleira.' });
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const nome = String(resultado.nomeFicheiro || 'ficha.pdf').replace(/[\r\n"]/g, '');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': String(resultado.mimeType || 'application/pdf'),
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
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
    usuario = await verificarTokenFirebase(datos.idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || 'listarPersoasAdministracion').trim();
  if (!['listarPersoasAdministracion', 'obterFichaPersoaAdministracion'].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion,
      email: usuario.email,
      uidFirebase: usuario.uid,
      rowId: String(datos.rowId || '').trim()
    }, {
      timeoutMs: accion === 'obterFichaPersoaAdministracion' ? TIMEOUT_FICHEIRO_MS : TIMEOUT_LISTADO_MS,
      attemptTimeoutMs: accion === 'obterFichaPersoaAdministracion' ? 45 * 1000 : 20 * 1000
    });

    if (!resultado?.ok) {
      const prohibido = resultado?.erro === 'Usuario non autorizado';
      return json(prohibido ? 403 : 400, {
        ok: false,
        erro: prohibido ? 'Non tes permiso para consultar os datos de persoas.' : (resultado?.erro || 'Non foi posible completar a solicitude.')
      });
    }

    if (accion === 'obterFichaPersoaAdministracion') return respostaFicheiro(resultado);
    return json(200, resultado);
  } catch (erro) {
    console.error('Erro na administración de persoas:', erro);
    return json(503, { ok: false, erro: 'O servizo de persoas non está dispoñible neste momento.' });
  }
}
