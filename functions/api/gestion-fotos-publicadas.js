import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const resposta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return { uid: String(usuario.localId || ''), email: String(usuario.email).trim().toLowerCase() };
}

async function comprobarAdministracion(env, usuario) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Administración non autorizada');
}

const idFoto = (foto) => String(foto?.idFoto || foto?.Id_Foto || foto?.rowId || '').trim();

function normalizar(foto, tipo) {
  return {
    idFoto: idFoto(foto),
    titulo: String(foto?.titulo || '').trim(),
    peFoto: String(foto?.peFoto || '').trim(),
    observacions: String(foto?.observacions || '').trim(),
    data: String(foto?.data || '').trim(),
    anoAproximado: String(foto?.anoAproximado || '').trim(),
    lugar: String(foto?.lugar || '').trim(),
    evento: String(foto?.evento || '').trim(),
    concerto: String(foto?.concerto || '').trim(),
    autor: String(foto?.autor || foto?.autoria || '').trim(),
    procedencia: String(foto?.procedencia || '').trim(),
    destacada: foto?.destacada === true,
    tipo
  };
}

async function listarTipo(env, usuario, tipo) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosPublicadas',
    email: usuario.email,
    uidFirebase: usuario.uid,
    tipo
  }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });
  if (!resultado?.ok || !Array.isArray(resultado.fotos)) {
    throw new Error(resultado?.erro || `Non se puideron listar as fotografías da galería ${tipo}.`);
  }
  return resultado.fotos.map((foto) => normalizar(foto, tipo)).filter((foto) => foto.idFoto);
}

async function listar(env, usuario) {
  const [publicas, privadas] = await Promise.all([
    listarTipo(env, usuario, 'publica'),
    listarTipo(env, usuario, 'privada')
  ]);
  const mapa = new Map();
  for (const foto of [...publicas, ...privadas]) {
    const actual = mapa.get(foto.idFoto) || {
      ...foto,
      publicarPublica: false,
      publicarPrivada: false,
      destacadaPublica: false,
      destacadaPrivada: false
    };
    if (foto.tipo === 'publica') {
      actual.publicarPublica = true;
      actual.destacadaPublica = foto.destacada;
    } else {
      actual.publicarPrivada = true;
      actual.destacadaPrivada = foto.destacada;
    }
    for (const campo of ['titulo','peFoto','observacions','data','anoAproximado','lugar','evento','concerto','autor','procedencia']) {
      if (!actual[campo] && foto[campo]) actual[campo] = foto[campo];
    }
    mapa.set(foto.idFoto, actual);
  }
  const fotos = [...mapa.values()].sort((a, b) =>
    String(a.titulo || '').localeCompare(String(b.titulo || ''), 'gl', { sensitivity: 'base' })
  );
  return { ok: true, total: fotos.length, fotos };
}

async function lerIndice(bucket, clave) {
  if (!bucket) return null;
  const obxecto = await bucket.get(clave);
  if (!obxecto) return null;
  const indice = await obxecto.json().catch(() => null);
  return indice && Array.isArray(indice.fotos) ? indice : null;
}

function rutaPrivada(foto) {
  return String(
    foto?.rutaR2Privada || foto?.rutaR2_Privada || foto?.RutaR2_Privada || foto?.rutaR2 || foto?.RutaR2 || ''
  ).trim();
}

function rutaPublica(foto) {
  return String(
    foto?.rutaR2Publica || foto?.rutaR2_Publica || foto?.RutaR2_Publica || foto?.rutaR2 || foto?.RutaR2 || ''
  ).trim();
}

async function resolverImaxe(env, id) {
  const indicePrivado = await lerIndice(env.R2_PRIVADO, INDEX_PRIVADO);
  const fotoPrivada = indicePrivado?.fotos?.find((foto) => idFoto(foto) === id);
  const clavePrivada = rutaPrivada(fotoPrivada);
  if (clavePrivada) {
    return { bucket: env.R2_PRIVADO, clave: clavePrivada, ambito: 'privado' };
  }

  const indicePublico = await lerIndice(env.R2_PUBLICO, INDEX_PUBLICO);
  const fotoPublica = indicePublico?.fotos?.find((foto) => idFoto(foto) === id);
  const clavePublica = rutaPublica(fotoPublica);
  if (clavePublica) {
    return { bucket: env.R2_PUBLICO, clave: clavePublica, ambito: 'publico' };
  }

  return null;
}

async function obterImaxe(env, datos) {
  const id = String(datos.idFoto || '').trim();
  if (!id) throw new Error('Falta o identificador da fotografía.');

  const resolta = await resolverImaxe(env, id);
  if (!resolta) {
    return json(404, { ok: false, erro: 'A fotografía non figura nos índices oficiais de R2.' });
  }

  const obxecto = await resolta.bucket.get(resolta.clave);
  if (!obxecto) return json(404, { ok: false, erro: 'O ficheiro indexado non existe en R2.' });

  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Photo-Source', `R2-${resolta.ambito.toUpperCase()}`);
  return new Response(obxecto.body, { headers });
}

async function actualizar(env, usuario, datos) {
  const id = String(datos.idFoto || '').trim();
  if (!id) throw new Error('Falta o identificador da fotografía.');

  const { resultado: metadatos } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'actualizarRevisionFoto',
    email: usuario.email,
    uidFirebase: usuario.uid,
    rowId: id,
    idFoto: id,
    estado: 'Aprobada',
    publicarPublica: false,
    publicarPrivada: false,
    destacadaPublica: false,
    destacadaPrivada: false,
    titulo: String(datos.titulo || '').trim(),
    peFoto: String(datos.peFoto || '').trim(),
    observacions: String(datos.observacions || '').trim()
  }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });
  if (!metadatos?.ok) throw new Error(metadatos?.erro || 'Non se puideron gardar os metadatos.');

  const publicarPublica = datos.publicarPublica === true;
  const publicarPrivada = datos.publicarPrivada === true;
  const { resultado: publicacion } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'actualizarPublicacionFoto',
    email: usuario.email,
    uidFirebase: usuario.uid,
    rowId: id,
    idFoto: id,
    publicarPublica,
    publicarPrivada,
    destacadaPublica: publicarPublica && datos.destacadaPublica === true,
    destacadaPrivada: publicarPrivada && datos.destacadaPrivada === true
  }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });
  if (!publicacion?.ok) throw new Error(publicacion?.erro || 'Non se puido actualizar a publicación.');

  return {
    ok: true,
    idFoto: id,
    publicarPublica,
    publicarPrivada,
    mensaxe: publicarPublica || publicarPrivada
      ? 'Cambios gardados. Os índices das galerías actualizaranse a continuación.'
      : 'A fotografía foi retirada das galerías, pero o arquivo consérvase en R2.'
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PUBLICO || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'A xestión de fotografías non está configurada.' });
  }
  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }
  const usuario = await verificarTokenFirebase(String(datos.idToken || ''), env.FIREBASE_API_KEY);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  try {
    await comprobarAdministracion(env, usuario);
    const accion = String(datos.accion || 'listar').trim();
    if (accion === 'listar') return json(200, await listar(env, usuario));
    if (accion === 'imaxe') return obterImaxe(env, datos);
    if (accion === 'actualizar') return json(200, await actualizar(env, usuario, datos));
    return json(400, { ok: false, erro: 'Acción non permitida' });
  } catch (erro) {
    console.error('Erro na xestión de fotografías publicadas:', erro);
    return json(503, { ok: false, erro: erro instanceof Error ? erro.message : 'O servizo non está dispoñible.' });
  }
}
