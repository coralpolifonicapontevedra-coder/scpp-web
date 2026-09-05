import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const CATALOGO = 'indices/catalogo-fotos.json';
const PHOTO_AUTH_PREFIX = 'cache/autorizacion-fotos/';
const ADMIN_AUTH_PREFIX = 'persoas/cache/administracion/';
const REVISION_FALLBACK_PREFIX = 'fotos/revision-miniaturas/';
const AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_CACHE_MS = 10 * 60 * 1000;
const MAX_THUMBS = 18;
const MAX_FALLBACK_BYTES = 1_500_000;
const MAX_DRIVE_BYTES = 8 * 1024 * 1024;

const tokenCache = new Map();

const texto = (valor) => String(valor ?? '').trim();
const idFoto = (foto) => texto(
  foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID']
);

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const token = texto(idToken);
  if (!token || !apiKey) return null;
  const cacheado = tokenCache.get(token);
  if (cacheado?.expira > Date.now()) return cacheado.usuario;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let resposta;
  try {
    resposta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resposta.ok) return null;
  const usuarioFirebase = (await resposta.json())?.users?.[0];
  if (!usuarioFirebase?.email || usuarioFirebase.emailVerified !== true) return null;
  const usuario = {
    uid: texto(usuarioFirebase.localId),
    email: texto(usuarioFirebase.email).toLowerCase()
  };
  tokenCache.set(token, { usuario, expira: Date.now() + TOKEN_CACHE_MS });
  while (tokenCache.size > 60) tokenCache.delete(tokenCache.keys().next().value);
  return usuario;
}

async function hashCorreo(email) {
  const bytes = new TextEncoder().encode(texto(email).toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function administracionCacheada(env, usuario) {
  if (!env.R2_PRIVADO || !usuario?.email) return false;
  const clave = await hashCorreo(usuario.email);
  const [fotoAuth, adminAuth] = await Promise.all([
    env.R2_PRIVADO.get(`${PHOTO_AUTH_PREFIX}${clave}.json`),
    env.R2_PRIVADO.get(`${ADMIN_AUTH_PREFIX}${clave}.json`)
  ]);

  if (fotoAuth) {
    const datos = await fotoAuth.json().catch(() => null);
    const verificadaEn = Date.parse(texto(datos?.verificadaEn));
    const mesmoCorreo = !datos?.email || texto(datos.email).toLowerCase() === usuario.email;
    if (datos?.administrador === true && mesmoCorreo && Number.isFinite(verificadaEn) && Date.now() - verificadaEn < AUTH_TTL_MS) {
      return true;
    }
  }

  if (adminAuth) {
    const datos = await adminAuth.json().catch(() => null);
    const gardadoEn = Number(datos?.savedAt || 0);
    if (
      datos?.administrador === usuario.email &&
      datos?.payload?.ok === true &&
      datos?.payload?.perfil?.nivel === 'Administración' &&
      Number.isFinite(gardadoEn) &&
      Date.now() - gardadoEn < AUTH_TTL_MS
    ) {
      return true;
    }
  }
  return false;
}

async function lerIndice(bucket, clave) {
  if (!bucket) return { fotos: [], xeradoEn: '', xeradoEnMs: 0, raw: null };
  const obxecto = await bucket.get(clave);
  if (!obxecto) return { fotos: [], xeradoEn: '', xeradoEnMs: 0, raw: null };
  const datos = await obxecto.json().catch(() => null);
  return {
    fotos: Array.isArray(datos?.fotos) ? datos.fotos : [],
    xeradoEn: texto(datos?.xeradoEn),
    xeradoEnMs: Number(datos?.xeradoEnMs || 0),
    raw: datos
  };
}

function estadoRevision(foto) {
  return texto(foto?.estadoRevision || foto?.EstadoRevision || foto?.estado || foto?.Estado).toLowerCase();
}

function combinar(...listas) {
  const mapa = new Map();
  for (const lista of listas) {
    for (const foto of lista || []) {
      const id = idFoto(foto);
      if (!id) continue;
      mapa.set(id, { ...(mapa.get(id) || {}), ...foto, idFoto: id });
    }
  }
  return mapa;
}

function normalizarCatalogo(indices) {
  const mapa = combinar(
    indices.revision.fotos,
    indices.publica.fotos,
    indices.privada.fotos,
    indices.catalogo.fotos
  );
  const idsPublicos = new Set(indices.publica.fotos.map(idFoto).filter(Boolean));
  const idsPrivados = new Set(indices.privada.fotos.map(idFoto).filter(Boolean));
  const idsRevision = new Set(indices.revision.fotos.map(idFoto).filter(Boolean));

  const fotos = [...mapa.values()].map((foto) => {
    const id = idFoto(foto);
    const publicarPublica = idsPublicos.has(id);
    const publicarPrivada = idsPrivados.has(id);
    const revision = estadoRevision(foto);
    const pendente = idsRevision.has(id) || revision.includes('pend') || revision.includes('revision') || revision.includes('revisión');
    const rexeitada = revision.includes('rexe') || revision.includes('rechaz');
    const estadoPublicacion = publicarPublica && publicarPrivada
      ? 'ambas'
      : publicarPublica
        ? 'publica'
        : publicarPrivada
          ? 'privada'
          : 'ningunha';
    const estadoXestion = publicarPublica || publicarPrivada
      ? 'publicada'
      : rexeitada
        ? 'rexeitada'
        : pendente
          ? 'pendente'
          : 'nonpublicada';

    const miniaturaDisponible = Boolean(texto(
      foto.rutaMiniaturaRevision || foto.rutaMiniaturaPrivada || foto.rutaMiniaturaPublica || foto.rutaMiniatura || foto.rutaR2Traballo
    ));

    return {
      idFoto: id,
      titulo: texto(foto.titulo || foto.Titulo || foto.nomeFicheiro || foto.filename) || 'Fotografía sen título',
      peFoto: texto(foto.peFoto || foto.PeFoto),
      observacions: texto(foto.observacions || foto.Observacions),
      data: texto(foto.data || foto.Data || foto.dataFoto),
      anoAproximado: texto(foto.anoAproximado || foto.AnoAproximado),
      lugar: texto(foto.lugar || foto.Lugar),
      autoria: texto(foto.autoria || foto.autor || foto.Autoria || foto.Autor),
      procedencia: texto(foto.procedencia || foto.Procedencia),
      evento: texto(foto.evento || foto.Evento),
      concerto: texto(foto.concerto || foto.Concerto),
      estadoRevision: revision,
      estadoPublicacion,
      estadoXestion,
      publicarPublica,
      publicarPrivada,
      destacadaPublica: foto.destacadaPublica === true || foto.Destacada_Publica === true,
      destacadaPrivada: foto.destacadaPrivada === true || foto.Destacada_Privada === true,
      miniaturaDisponible
    };
  });

  fotos.sort((a, b) => a.titulo.localeCompare(b.titulo, 'gl', { sensitivity: 'base' }));
  return { fotos, mapa, idsPublicos, idsPrivados, idsRevision };
}

async function cargarIndices(env) {
  const [revision, publica, privada, catalogo] = await Promise.all([
    lerIndice(env.R2_PRIVADO, INDEX_REVISION),
    lerIndice(env.R2_PUBLICO, INDEX_PUBLICO),
    lerIndice(env.R2_PRIVADO, INDEX_PRIVADO),
    lerIndice(env.R2_PRIVADO, CATALOGO)
  ]);
  return { revision, publica, privada, catalogo };
}

function candidatosMiniatura(foto) {
  const privado = [
    foto?.rutaMiniaturaRevision,
    foto?.rutaMiniaturaPrivada,
    foto?.rutaMiniatura,
    foto?.rutaR2Privada,
    foto?.rutaR2Traballo
  ].map(texto).filter(Boolean);
  const publico = [
    foto?.rutaMiniaturaPublica,
    foto?.rutaMiniatura,
    foto?.rutaR2Publica,
    foto?.rutaR2
  ].map(texto).filter(Boolean);
  return {
    privado: [...new Set(privado)],
    publico: [...new Set(publico)]
  };
}

async function primeiraImaxe(bucket, rutas) {
  if (!bucket) return null;
  for (const ruta of rutas) {
    const obxecto = await bucket.get(ruta);
    if (!obxecto) continue;
    const pareceMiniatura = /miniatura|thumb/i.test(ruta);
    if (!pareceMiniatura && Number(obxecto.size || 0) > MAX_FALLBACK_BYTES) continue;
    return { obxecto, ruta, pareceMiniatura };
  }
  return null;
}

function base64(bytes) {
  const bloque = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += bloque) {
    binario += String.fromCharCode(...bytes.subarray(i, Math.min(i + bloque, bytes.length)));
  }
  return btoa(binario);
}

function bytesDesdeBase64(valor) {
  const raw = texto(valor);
  if (!raw) return null;
  const binario = atob(raw);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function extensionMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function gardarRutaFallbackNoIndice(env, id, ruta) {
  const actual = await lerIndice(env.R2_PRIVADO, INDEX_REVISION);
  const raw = actual.raw || { ok: true };
  const fotos = [...actual.fotos];
  const indice = fotos.findIndex((foto) => idFoto(foto) === id);
  if (indice === -1) return;

  fotos[indice] = {
    ...fotos[indice],
    rutaMiniaturaRevision: ruta,
    rutaR2Traballo: ruta
  };

  const agora = new Date();
  await env.R2_PRIVADO.put(INDEX_REVISION, JSON.stringify({
    ...raw,
    ok: true,
    fotos,
    total: fotos.length,
    xeradoEn: agora.toISOString(),
    xeradoEnMs: agora.getTime(),
    actualizadoDesde: 'DRIVE-FALLBACK-REVISION'
  }), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, max-age=0, no-cache, must-revalidate'
    }
  });
}

async function recuperarDeDrive(env, usuario, id) {
  if (!env.WEB_WRITE_TOKEN) return null;

  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'obterFotoParaR2',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto: id,
    rowId: id,
    publicarPrivada: true,
    publicarPublica: false
  }, { timeoutMs: 75_000, attemptTimeoutMs: 25_000 });

  if (!resultado?.ok) return null;
  const mimeType = texto(resultado.mimeType || 'image/jpeg').toLowerCase();
  const bytes = bytesDesdeBase64(resultado.base64);
  if (!bytes?.byteLength || bytes.byteLength > MAX_DRIVE_BYTES) return null;

  const ruta = `${REVISION_FALLBACK_PREFIX}${id}.${extensionMime(mimeType)}`;
  await env.R2_PRIVADO.put(ruta, bytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: 'private, max-age=86400'
    },
    customMetadata: {
      idFoto: id,
      orixe: 'drive-fallback-revision',
      gardadoEn: new Date().toISOString()
    }
  });
  await gardarRutaFallbackNoIndice(env, id, ruta);

  const obxecto = await env.R2_PRIVADO.get(ruta);
  return obxecto ? { obxecto, ruta, pareceMiniatura: true } : null;
}

async function miniaturas(env, ids, mapa, usuario) {
  const unicos = [...new Set(ids.map(texto).filter(Boolean))].slice(0, MAX_THUMBS);
  const imaxes = [];

  for (const id of unicos) {
    const foto = mapa.get(id);
    if (!foto) {
      imaxes.push({ idFoto: id, ok: false });
      continue;
    }

    const candidatos = candidatosMiniatura(foto);
    let atopada = await primeiraImaxe(env.R2_PRIVADO, candidatos.privado);
    let fonte = atopada ? 'R2-PRIVADO' : '';
    if (!atopada) {
      atopada = await primeiraImaxe(env.R2_PUBLICO, candidatos.publico);
      fonte = atopada ? 'R2-PUBLICO' : '';
    }
    if (!atopada && estadoRevision(foto).includes('pend')) {
      atopada = await recuperarDeDrive(env, usuario, id).catch((erro) => {
        console.warn(`Non se puido recuperar a miniatura ${id} desde Drive:`, erro);
        return null;
      });
      fonte = atopada ? 'DRIVE→R2-PRIVADO' : '';
    }
    if (!atopada) {
      imaxes.push({ idFoto: id, ok: false });
      continue;
    }

    const bytes = new Uint8Array(await atopada.obxecto.arrayBuffer());
    const tipo = texto(atopada.obxecto.httpMetadata?.contentType) || 'image/jpeg';
    imaxes.push({
      idFoto: id,
      ok: true,
      mimeType: tipo,
      base64: base64(bytes),
      fonte,
      miniatura: atopada.pareceMiniatura
    });
  }

  return imaxes;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO || !env.R2_PUBLICO) {
    return json(500, { ok: false, erro: 'A administración de fotografías non está configurada.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const usuario = await verificarTokenFirebase(datos.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await administracionCacheada(env, usuario))) {
    return json(403, { ok: false, erro: 'Administración non autorizada ou caché de permisos non preparada.' });
  }

  try {
    const inicio = Date.now();
    const indices = await cargarIndices(env);
    const catalogo = normalizarCatalogo(indices);
    const accion = texto(datos.accion || 'listar');

    if (accion === 'listar') {
      const conta = (estado) => catalogo.fotos.filter((foto) => foto.estadoXestion === estado).length;
      return json(200, {
        ok: true,
        fotos: catalogo.fotos,
        total: catalogo.fotos.length,
        publicas: catalogo.idsPublicos.size,
        privadas: catalogo.idsPrivados.size,
        pendentes: conta('pendente'),
        publicadas: conta('publicada'),
        nonPublicadas: conta('nonpublicada'),
        rexeitadas: conta('rexeitada'),
        xeradoEn: indices.catalogo.xeradoEn || indices.revision.xeradoEn || indices.publica.xeradoEn,
        orixe: 'R2-ONLY',
        tempoRespostaMs: Date.now() - inicio
      }, {
        'X-SCPP-Photos-Source': 'R2-ONLY',
        'Server-Timing': `r2;dur=${Date.now() - inicio}`
      });
    }

    if (accion === 'miniaturas') {
      const ids = Array.isArray(datos.ids) ? datos.ids : [];
      if (!ids.length) return json(400, { ok: false, erro: 'Non se indicaron fotografías.' });
      const imaxes = await miniaturas(env, ids, catalogo.mapa, usuario);
      return json(200, { ok: true, imaxes, total: imaxes.length, orixe: 'R2-BATCH-WITH-DRIVE-FALLBACK' }, {
        'X-SCPP-Photos-Source': 'R2-BATCH-WITH-DRIVE-FALLBACK'
      });
    }

    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (erro) {
    console.error('Erro na administración rápida de fotografías:', erro);
    return json(503, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non se puido cargar o arquivo fotográfico.'
    });
  }
}
