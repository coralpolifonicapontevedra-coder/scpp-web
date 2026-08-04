import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
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

async function claveCorreo(email) {
  const bytes = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

async function administracionCacheada(env, usuario) {
  if (!env.R2_PRIVADO) return false;
  const clave = await claveCorreo(usuario.email);
  const obxecto = await env.R2_PRIVADO.get(`cache/autorizacion-fotos/${clave}.json`);
  if (!obxecto) return false;
  const datos = await obxecto.json().catch(() => null);
  const verificadaEn = Date.parse(String(datos?.verificadaEn || ''));
  return datos?.administrador === true && Number.isFinite(verificadaEn) && Date.now() - verificadaEn < AUTH_TTL_MS;
}

async function comprobarAdministracion(env, usuario) {
  if (await administracionCacheada(env, usuario)) return;
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Administración non autorizada');
}

const idFoto = (foto) => String(foto?.idFoto || foto?.Id_Foto || foto?.rowId || '').trim();
const texto = (valor) => String(valor || '').trim();

function rutaPrivada(foto) {
  return texto(foto?.rutaR2Privada || foto?.rutaR2_Privada || foto?.RutaR2_Privada || foto?.rutaR2 || foto?.RutaR2);
}

function rutaPublica(foto) {
  return texto(foto?.rutaR2Publica || foto?.rutaR2_Publica || foto?.RutaR2_Publica || foto?.rutaR2 || foto?.RutaR2);
}

function rutaMiniaturaPrivada(foto) {
  return texto(foto?.rutaMiniaturaPrivada || foto?.rutaMiniatura_Privada || foto?.RutaMiniaturaPrivada);
}

function rutaMiniaturaPublica(foto) {
  return texto(foto?.rutaMiniaturaPublica || foto?.rutaMiniatura_Publica || foto?.RutaMiniaturaPublica);
}

function normalizar(foto, tipo) {
  return {
    idFoto: idFoto(foto),
    titulo: texto(foto?.titulo || foto?.Titulo),
    peFoto: texto(foto?.peFoto || foto?.PeFoto),
    observacions: texto(foto?.observacions || foto?.Observacions),
    data: texto(foto?.data || foto?.Data),
    anoAproximado: texto(foto?.anoAproximado || foto?.AnoAproximado),
    lugar: texto(foto?.lugar || foto?.Lugar),
    evento: texto(foto?.evento || foto?.Evento),
    concerto: texto(foto?.concerto || foto?.Concerto),
    autor: texto(foto?.autor || foto?.autoria || foto?.Autor || foto?.Autoria),
    procedencia: texto(foto?.procedencia || foto?.Procedencia),
    destacada: foto?.destacada === true || foto?.Destacada === true,
    rutaR2: tipo === 'privada' ? rutaPrivada(foto) : rutaPublica(foto),
    rutaMiniatura: tipo === 'privada' ? rutaMiniaturaPrivada(foto) : rutaMiniaturaPublica(foto),
    tipo
  };
}

async function lerIndice(bucket, clave) {
  if (!bucket) return null;
  const obxecto = await bucket.get(clave);
  if (!obxecto) return null;
  const indice = await obxecto.json().catch(() => null);
  return indice && Array.isArray(indice.fotos) ? indice : null;
}

async function listar(env) {
  const inicio = Date.now();
  const [indicePublico, indicePrivado] = await Promise.all([
    lerIndice(env.R2_PUBLICO, INDEX_PUBLICO),
    lerIndice(env.R2_PRIVADO, INDEX_PRIVADO)
  ]);

  if (!indicePublico && !indicePrivado) {
    throw new Error('Os índices das galerías non están dispoñibles en R2.');
  }

  const publicas = (indicePublico?.fotos || []).map((foto) => normalizar(foto, 'publica')).filter((foto) => foto.idFoto);
  const privadas = (indicePrivado?.fotos || []).map((foto) => normalizar(foto, 'privada')).filter((foto) => foto.idFoto);
  const mapa = new Map();

  for (const foto of [...publicas, ...privadas]) {
    const actual = mapa.get(foto.idFoto) || {
      ...foto,
      publicarPublica: false,
      publicarPrivada: false,
      destacadaPublica: false,
      destacadaPrivada: false,
      rutaR2Publica: '',
      rutaR2Privada: '',
      rutaMiniaturaPublica: '',
      rutaMiniaturaPrivada: ''
    };

    if (foto.tipo === 'publica') {
      actual.publicarPublica = true;
      actual.destacadaPublica = foto.destacada;
      actual.rutaR2Publica = foto.rutaR2;
      actual.rutaMiniaturaPublica = foto.rutaMiniatura;
    } else {
      actual.publicarPrivada = true;
      actual.destacadaPrivada = foto.destacada;
      actual.rutaR2Privada = foto.rutaR2;
      actual.rutaMiniaturaPrivada = foto.rutaMiniatura;
    }

    for (const campo of ['titulo','peFoto','observacions','data','anoAproximado','lugar','evento','concerto','autor','procedencia']) {
      if (!actual[campo] && foto[campo]) actual[campo] = foto[campo];
    }
    mapa.set(foto.idFoto, actual);
  }

  const fotos = [...mapa.values()].sort((a, b) =>
    texto(a.titulo || a.peFoto).localeCompare(texto(b.titulo || b.peFoto), 'gl', { sensitivity: 'base' })
  );

  return {
    ok: true,
    total: fotos.length,
    fotos,
    orixe: 'R2-INDICES',
    xeradoEnPublico: indicePublico?.xeradoEn || '',
    xeradoEnPrivado: indicePrivado?.xeradoEn || '',
    tempoRespostaMs: Date.now() - inicio
  };
}

async function resolverImaxe(env, id) {
  const [indicePrivado, indicePublico] = await Promise.all([
    lerIndice(env.R2_PRIVADO, INDEX_PRIVADO),
    lerIndice(env.R2_PUBLICO, INDEX_PUBLICO)
  ]);

  const fotoPrivada = indicePrivado?.fotos?.find((foto) => idFoto(foto) === id);
  const clavePrivada = rutaPrivada(fotoPrivada);
  if (clavePrivada) return { bucket: env.R2_PRIVADO, clave: clavePrivada, ambito: 'privado' };

  const fotoPublica = indicePublico?.fotos?.find((foto) => idFoto(foto) === id);
  const clavePublica = rutaPublica(fotoPublica);
  if (clavePublica) return { bucket: env.R2_PUBLICO, clave: clavePublica, ambito: 'publico' };

  return null;
}

async function obterImaxe(env, datos) {
  const id = texto(datos.idFoto);
  if (!id) throw new Error('Falta o identificador da fotografía.');
  const resolta = await resolverImaxe(env, id);
  if (!resolta) return json(404, { ok: false, erro: 'A fotografía non figura nos índices oficiais de R2.' });
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
  const id = texto(datos.idFoto);
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
    titulo: texto(datos.titulo),
    peFoto: texto(datos.peFoto),
    observacions: texto(datos.observacions)
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

  const usuario = await verificarTokenFirebase(texto(datos.idToken), env.FIREBASE_API_KEY);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  try {
    await comprobarAdministracion(env, usuario);
    const accion = texto(datos.accion || 'listar');
    if (accion === 'listar') {
      const resultado = await listar(env);
      return json(200, resultado, {
        'X-SCPP-Photo-List': 'R2-INDICES',
        'Server-Timing': `r2;dur=${resultado.tempoRespostaMs}`
      });
    }
    if (accion === 'imaxe') return obterImaxe(env, datos);
    if (accion === 'actualizar') return json(200, await actualizar(env, usuario, datos));
    return json(400, { ok: false, erro: 'Acción non permitida' });
  } catch (erro) {
    console.error('Erro na xestión de fotografías publicadas:', erro);
    return json(503, { ok: false, erro: erro instanceof Error ? erro.message : 'O servizo non está dispoñible.' });
  }
}
