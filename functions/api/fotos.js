import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

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

  const idToken = String(datos.idToken || '').trim();
  let usuario;
  try {
    usuario = idToken && await verificarTokenFirebase(idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const accion = String(datos.accion || 'subirFoto').trim();
  const accionsPermitidas = new Set([
    'subirFoto',
    'listarFotosRevision',
    'actualizarRevisionFoto'
  ]);
  if (!accionsPermitidas.has(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  const tipo = String(datos.tipo || '').toLowerCase();
  const base64 = String(datos.base64 || '');
  if (accion === 'subirFoto') {
    if (!String(datos.titulo || '').trim() ||
        !String(datos.nomeFicheiro || '').trim() || !base64 || !TIPOS.has(tipo)) {
      return json(400, { ok: false, erro: 'Faltan datos ou o formato non é compatible' });
    }
    if (Math.floor((base64.length * 3) / 4) > MAX_BYTES) {
      return json(413, { ok: false, erro: 'A fotografía supera o máximo de 8 MB' });
    }
  }

  const corpo = {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: usuario.email,
    uidFirebase: usuario.uid,
    nomeFicheiro: String(datos.nomeFicheiro || '').trim(),
    tipo,
    base64,
    titulo: String(datos.titulo || '').trim(),
    peFoto: String(datos.peFoto || '').trim(),
    lugar: String(datos.lugar || '').trim(),
    dataFoto: String(datos.dataFoto || '').trim(),
    anoAproximado: String(datos.anoAproximado || '').trim(),
    autoria: String(datos.autoria || '').trim(),
    procedencia: String(datos.procedencia || '').trim(),
    concerto: String(datos.concerto || '').trim(),
    evento: String(datos.evento || '').trim(),
    confirmaDereitos: datos.confirmaDereitos === true,
    rowId: String(datos.rowId || '').trim(),
    estado: String(datos.estado || '').trim(),
    publicarPublica: datos.publicarPublica === true,
    publicarPrivada: datos.publicarPrivada === true,
    destacadaPublica: datos.destacadaPublica === true,
    destacadaPrivada: datos.destacadaPrivada === true,
    observacions: String(datos.observacions || '').trim()
  };

  try {
    const pesada = accion === 'subirFoto';
    const { resultado, usouRespaldo } = await obterJsonAppsScript(
      env,
      corpo,
      {
        timeoutMs: pesada ? 75_000 : 35_000,
        attemptTimeoutMs: pesada ? 25_000 : 12_000
      }
    );

    if (!resultado?.ok) {
      return json(resultado?.erro === 'Usuario non autorizado' ? 403 : 400, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible completar a operación de fotografías.'
      });
    }

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY'
      }
    });
  } catch (erro) {
    console.error('Erro no servizo de fotografías:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: 'O servizo de fotografías non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
