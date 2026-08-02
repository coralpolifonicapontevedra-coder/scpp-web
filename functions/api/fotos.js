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

function decodificarBase64(base64) {
  const binario = atob(String(base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

function extensionPorMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function gardarFotoEnR2(env, resultado) {
  if (!env.R2_PUBLICO || !env.R2_PRIVADO) {
    throw new Error('Os buckets R2 non están configurados.');
  }

  const idFoto = String(resultado.idFoto || resultado.rowId || '').trim();
  const mimeType = String(resultado.mimeType || '').trim().toLowerCase();
  const base64 = String(resultado.base64 || '').trim();

  if (!idFoto || !TIPOS.has(mimeType) || !base64) {
    throw new Error('Apps Script non devolveu unha fotografía válida para R2.');
  }

  const bytes = decodificarBase64(base64);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error('A fotografía supera o máximo de 8 MB.');
  }

  const extension = extensionPorMime(mimeType);
  const rutas = {};
  const metadata = {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: {
      idFoto,
      orixe: 'google-drive'
    }
  };

  if (resultado.publicarPublica === true) {
    const rutaPublica = `fotos/orixinais/${idFoto}.${extension}`;
    await env.R2_PUBLICO.put(rutaPublica, bytes, metadata);
    rutas.publica = rutaPublica;
  }

  if (resultado.publicarPrivada === true) {
    const rutaPrivada = `fotos/orixinais/${idFoto}.${extension}`;
    await env.R2_PRIVADO.put(rutaPrivada, bytes, metadata);
    rutas.privada = rutaPrivada;
  }

  if (!rutas.publica && !rutas.privada) {
    throw new Error('A fotografía non está publicada en ningunha galería.');
  }

  return rutas;
}

async function migrarFotoPublicada(env, usuario, idFoto) {
  const identificador = String(idFoto || '').trim();
  if (!identificador) {
    throw new Error('Non se puido determinar o identificador da fotografía publicada.');
  }

  const { resultado } = await obterJsonAppsScript(
    env,
    {
      token: env.WEB_WRITE_TOKEN,
      accion: 'obterFotoParaR2',
      email: usuario.email,
      uidFirebase: usuario.uid,
      idFoto: identificador,
      rowId: identificador
    },
    { timeoutMs: 75_000, attemptTimeoutMs: 25_000 }
  );

  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non se puido obter a fotografía para copiala a R2.');
  }

  const rutas = await gardarFotoEnR2(env, resultado);
  const idGardado = String(resultado.idFoto || resultado.rowId || identificador).trim();

  const { resultado: gardado } = await obterJsonAppsScript(
    env,
    {
      token: env.WEB_WRITE_TOKEN,
      accion: 'gardarRutasFotoR2',
      email: usuario.email,
      uidFirebase: usuario.uid,
      idFoto: idGardado,
      rutaPublica: String(rutas.publica || ''),
      rutaPrivada: String(rutas.privada || '')
    },
    { timeoutMs: 35_000, attemptTimeoutMs: 12_000 }
  );

  if (!gardado?.ok) {
    throw new Error(gardado?.erro || 'A foto copiose a R2, pero non se puideron gardar as rutas na folla Fotos.');
  }

  return { idFoto: idGardado, rutas };
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
    'actualizarRevisionFoto',
    'listarFotosGaleria',
    'obterFotoGaleria',
    'listarFotosPublicadas',
    'actualizarPublicacionFoto',
    'listarFotosPendentesR2',
    'migrarFotoR2'
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
    accion: accion === 'migrarFotoR2' ? 'obterFotoParaR2' : accion,
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
    idFoto: String(datos.idFoto || '').trim(),
    estado: String(datos.estado || '').trim(),
    publicarPublica: datos.publicarPublica === true,
    publicarPrivada: datos.publicarPrivada === true,
    destacadaPublica: datos.destacadaPublica === true,
    destacadaPrivada: datos.destacadaPrivada === true,
    observacions: String(datos.observacions || '').trim()
  };

  try {
    const pesada = accion === 'subirFoto' || accion === 'obterFotoGaleria' || accion === 'migrarFotoR2';
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

    if (accion === 'migrarFotoR2') {
      const migrada = await migrarFotoPublicada(
        env,
        usuario,
        String(resultado.idFoto || resultado.rowId || corpo.idFoto || corpo.rowId).trim()
      );
      return json(200, {
        ok: true,
        ...migrada,
        mensaxe: 'Fotografía copiada a R2 e rutas gardadas correctamente'
      });
    }

    const debeMigrarTrasPublicar = accion === 'actualizarRevisionFoto' &&
      corpo.estado.toLowerCase() === 'aprobada' &&
      (corpo.publicarPublica || corpo.publicarPrivada);

    if (debeMigrarTrasPublicar) {
      const identificador = String(
        resultado.idFoto || resultado.rowId || corpo.idFoto || corpo.rowId
      ).trim();
      const migrada = await migrarFotoPublicada(env, usuario, identificador);
      return json(200, {
        ...resultado,
        ok: true,
        idFoto: migrada.idFoto,
        rutasR2: migrada.rutas,
        mensaxe: 'Fotografía aprobada, copiada a R2 e publicada correctamente'
      });
    }

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': accion === 'listarFotosGaleria'
          ? 'private, max-age=120'
          : 'no-store',
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY'
      }
    });
  } catch (erro) {
    console.error('Erro no servizo de fotografías:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: erro instanceof Error && erro.message
        ? erro.message
        : 'O servizo de fotografías non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
