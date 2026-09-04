import { obterJsonAppsScript } from './apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from './portal-permissions.js';

const MODULO = 'fotografias';
const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const CATALOGO = 'indices/catalogo-fotos.json';
const CACHE_REVISION = 'cache/fotos/listar-revision.json';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const TOKEN_CACHE_MS = 10 * 60 * 1000;
const TIPOS_IMAXE = new Set(['image/jpeg', 'image/png', 'image/webp']);

const tokenCache = new Map();
const texto = (valor) => String(valor ?? '').trim();
const idFoto = (foto) => texto(
  foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID']
);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarToken(idToken, apiKey) {
  const token = texto(idToken);
  if (!token || !apiKey) return null;
  const cacheado = tokenCache.get(token);
  if (cacheado?.expira > Date.now()) return cacheado.usuario;

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
    const usuario = { uid: texto(user.localId), email: texto(user.email).toLowerCase() };
    tokenCache.set(token, { usuario, expira: Date.now() + TOKEN_CACHE_MS });
    while (tokenCache.size > 80) tokenCache.delete(tokenCache.keys().next().value);
    return usuario;
  } finally {
    clearTimeout(timer);
  }
}

async function autorizarFotografias(env, usuario) {
  let permiso = await obterPermisoPortalCacheado(env, usuario, MODULO);
  if (!permiso) permiso = await obterPermisoPortal(env, usuario, MODULO);
  return permiso?.podeEscribir === true ? permiso : null;
}

async function gardarSheet(env, usuario, datos) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'gardarFotoAdministracionPortal',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto: datos.idFoto,
    titulo: datos.titulo,
    peFoto: datos.peFoto,
    observacions: datos.observacions,
    publicarPublica: datos.publicarPublica,
    publicarPrivada: datos.publicarPrivada,
    destacadaPublica: false,
    destacadaPrivada: false,
    rutaR2Publica: datos.rutaR2Publica,
    rutaR2Privada: datos.rutaR2Privada,
    autorizacionR2: true,
    moduloAutorizado: MODULO
  }, { timeoutMs: 25_000, attemptTimeoutMs: 25_000 });

  if (!resultado?.ok) throw new Error(resultado?.erro || 'Non se puido gardar a fotografía na Sheet');
  if (
    resultado.publicarPublica !== datos.publicarPublica ||
    resultado.publicarPrivada !== datos.publicarPrivada
  ) {
    throw new Error('A Sheet non confirmou o estado de publicación solicitado');
  }
  return resultado;
}

async function ler(bucket, clave) {
  const object = await bucket.get(clave);
  if (!object) return { ok: true, fotos: [], total: 0 };
  const datos = await object.json().catch(() => null);
  if (!datos || !Array.isArray(datos.fotos)) throw new Error(`Índice R2 non válido: ${clave}`);
  return datos;
}

async function gardar(bucket, clave, indice, publico = false) {
  await bucket.put(clave, JSON.stringify(indice), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: publico
        ? 'public, max-age=0, no-cache, must-revalidate'
        : 'private, max-age=0, no-cache, must-revalidate'
    }
  });
}

function preparar(indice, fotos, operacionId) {
  const agora = new Date();
  return {
    ...indice,
    ok: true,
    fotos,
    total: fotos.length,
    xeradoEn: agora.toISOString(),
    xeradoEnMs: agora.getTime(),
    actualizadoDesde: `FOTOS-ADMIN-V3-${operacionId}`,
    version: '10'
  };
}

function mapa(...listas) {
  const result = new Map();
  for (const lista of listas) {
    for (const foto of lista || []) {
      const id = idFoto(foto);
      if (id) result.set(id, { ...(result.get(id) || {}), ...foto, idFoto: id });
    }
  }
  return result;
}

function ruta(foto, tipo) {
  if (tipo === 'publica') {
    return texto(foto?.rutaR2Publica || foto?.rutaR2_Publica || foto?.RutaR2_Publica || foto?.rutaR2 || foto?.RutaR2);
  }
  return texto(
    foto?.rutaR2Privada || foto?.rutaR2_Privada || foto?.RutaR2_Privada ||
    foto?.rutaR2Traballo || foto?.rutaR2 || foto?.RutaR2
  );
}

function miniatura(foto, tipo) {
  if (tipo === 'publica') {
    return texto(
      foto?.rutaMiniaturaPublica || foto?.rutaMiniatura_Publica || foto?.RutaMiniaturaPublica || foto?.rutaMiniatura
    );
  }
  return texto(
    foto?.rutaMiniaturaPrivada || foto?.rutaMiniaturaRevision || foto?.rutaMiniatura_Privada || foto?.rutaMiniatura
  );
}

function decodificarBase64(base64, maxBytes, etiqueta) {
  const raw = texto(base64);
  if (!raw) return null;
  const binario = atob(raw);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  if (!bytes.byteLength || bytes.byteLength > maxBytes) {
    throw new Error(`${etiqueta} supera o tamaño máximo permitido`);
  }
  return bytes;
}

function extensionMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function escribirImaxe(bucket, clave, bytes, mimeType, usuario, id, tipo, publico) {
  await bucket.put(clave, bytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: publico
        ? 'public, max-age=31536000, immutable'
        : 'private, max-age=31536000, immutable'
    },
    customMetadata: {
      idFoto: id,
      tipo,
      editadaPor: usuario.email,
      editadaEn: new Date().toISOString(),
      backend: 'fotos-administracion-v3'
    }
  });
}

async function copiarSeFalta(bucketDestino, bucketOrixe, clave, publico) {
  if (!clave || await bucketDestino.head(clave)) return;
  const source = await bucketOrixe.get(clave);
  if (!source) throw new Error(`Non se atopou en R2 o ficheiro ${clave}`);
  await bucketDestino.put(clave, await source.arrayBuffer(), {
    httpMetadata: {
      contentType: texto(source.httpMetadata?.contentType) || 'image/jpeg',
      cacheControl: publico
        ? 'public, max-age=31536000, immutable'
        : 'private, max-age=31536000, immutable'
    }
  });
}

async function prepararEdicion(env, usuario, id, datos, publicarPublica) {
  if (!texto(datos.base64)) return null;

  const mimeType = texto(datos.mimeType || 'image/jpeg').toLowerCase();
  if (!TIPOS_IMAXE.has(mimeType)) throw new Error('Formato de imaxe non válido');
  const bytes = decodificarBase64(datos.base64, MAX_IMAGE_BYTES, 'A fotografía editada');
  const thumbMime = texto(datos.miniaturaMimeType || 'image/jpeg').toLowerCase();
  const thumbBytes = texto(datos.miniaturaBase64)
    ? decodificarBase64(datos.miniaturaBase64, MAX_THUMB_BYTES, 'A miniatura')
    : null;
  if (thumbBytes && !TIPOS_IMAXE.has(thumbMime)) throw new Error('Formato de miniatura non válido');

  const marca = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const op = crypto.randomUUID();
  const rutaPrivada = `fotos/editadas/${id}-${marca}-${op.slice(0, 8)}.${extensionMime(mimeType)}`;
  const rutaPublica = publicarPublica ? rutaPrivada : '';
  const rutaMiniaturaPrivada = thumbBytes
    ? `fotos/editadas-miniaturas/${id}-${marca}-${op.slice(0, 8)}.${extensionMime(thumbMime)}`
    : '';
  const rutaMiniaturaPublica = publicarPublica ? rutaMiniaturaPrivada : '';

  await escribirImaxe(env.R2_PRIVADO, rutaPrivada, bytes, mimeType, usuario, id, 'edicion', false);
  if (publicarPublica) await escribirImaxe(env.R2_PUBLICO, rutaPublica, bytes, mimeType, usuario, id, 'edicion', true);
  if (thumbBytes) {
    await escribirImaxe(env.R2_PRIVADO, rutaMiniaturaPrivada, thumbBytes, thumbMime, usuario, id, 'miniatura', false);
    if (publicarPublica) {
      await escribirImaxe(env.R2_PUBLICO, rutaMiniaturaPublica, thumbBytes, thumbMime, usuario, id, 'miniatura', true);
    }
  }

  return {
    rutaPrivada,
    rutaPublica,
    rutaMiniaturaPrivada,
    rutaMiniaturaPublica,
    novasPrivadas: [rutaPrivada, rutaMiniaturaPrivada].filter(Boolean),
    novasPublicas: [rutaPublica, rutaMiniaturaPublica].filter(Boolean)
  };
}

async function limparEdicion(env, edicion) {
  if (!edicion) return;
  await Promise.allSettled([
    ...edicion.novasPrivadas.map((clave) => env.R2_PRIVADO.delete(clave)),
    ...edicion.novasPublicas.map((clave) => env.R2_PUBLICO.delete(clave))
  ]);
}

export async function onRequestFotosAdministracionV3({ request, env }) {
  const inicio = Date.now();
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PUBLICO || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'Administración de fotografías non configurada' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }
  if (texto(datos.accion || 'gardar') !== 'gardar') {
    return json(400, { ok: false, erro: 'Acción non permitida no backend de Fotografías' });
  }

  const usuario = await verificarToken(datos.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'Identificación non válida ou caducada' });

  let permiso;
  try {
    permiso = await autorizarFotografias(env, usuario);
  } catch (error) {
    return json(503, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non se puido comprobar o permiso de Fotografías.'
    });
  }
  if (!permiso) {
    return json(403, { ok: false, erro: 'A túa conta non ten permiso de escritura en Fotografías.' });
  }

  let edicion;
  try {
    const [pub0, pri0, rev0, cat0] = await Promise.all([
      ler(env.R2_PUBLICO, INDEX_PUBLICO),
      ler(env.R2_PRIVADO, INDEX_PRIVADO),
      ler(env.R2_PRIVADO, INDEX_REVISION),
      ler(env.R2_PRIVADO, CATALOGO)
    ]);
    const mp = mapa(rev0.fotos, pub0.fotos, pri0.fotos, cat0.fotos);
    const id = texto(datos.idFoto);
    if (!id || !mp.has(id)) return json(404, { ok: false, erro: 'Fotografía non localizada no catálogo R2' });

    const publicarPublica = datos.publicarPublica === true;
    const publicarPrivada = datos.publicarPrivada === true;
    const base = mp.get(id);
    const operacionId = crypto.randomUUID();
    const metadatos = {
      titulo: texto(datos.titulo ?? base.titulo ?? base.Titulo),
      peFoto: texto(datos.peFoto ?? base.peFoto ?? base.PeFoto),
      observacions: texto(datos.observacions ?? base.observacions ?? base.Observacions)
    };

    edicion = await prepararEdicion(env, usuario, id, datos, publicarPublica);

    const rutaPrivada = edicion?.rutaPrivada || ruta(base, 'privada') || ruta(base, 'publica');
    const rutaPublica = edicion?.rutaPublica || ruta(base, 'publica') || rutaPrivada;
    const miniPrivada = edicion?.rutaMiniaturaPrivada || miniatura(base, 'privada') || miniatura(base, 'publica');
    const miniPublica = edicion?.rutaMiniaturaPublica || miniatura(base, 'publica') || miniPrivada;

    if (!rutaPrivada && !rutaPublica) throw new Error('A fotografía non ten unha ruta R2 recuperable');

    if (!edicion) {
      const copias = [];
      if (publicarPrivada && rutaPrivada) copias.push(copiarSeFalta(env.R2_PRIVADO, env.R2_PUBLICO, rutaPrivada, false));
      if (publicarPublica && rutaPublica) copias.push(copiarSeFalta(env.R2_PUBLICO, env.R2_PRIVADO, rutaPublica, true));
      if (publicarPrivada && miniPrivada) copias.push(copiarSeFalta(env.R2_PRIVADO, env.R2_PUBLICO, miniPrivada, false).catch(() => {}));
      if (publicarPublica && miniPublica) copias.push(copiarSeFalta(env.R2_PUBLICO, env.R2_PRIVADO, miniPublica, true).catch(() => {}));
      if (copias.length) await Promise.all(copias);
    }

    const estadoPublicacion = publicarPublica && publicarPrivada
      ? 'ambas'
      : publicarPublica
        ? 'publica'
        : publicarPrivada
          ? 'privada'
          : 'ningunha';
    const estadoXestion = publicarPublica || publicarPrivada ? 'publicada' : 'nonpublicada';

    const baseNova = {
      ...base,
      ...metadatos,
      idFoto: id,
      estadoRevision: 'aprobada',
      estado: 'Aprobada',
      publicarPublica,
      publicarPrivada,
      estadoPublicacion,
      estadoXestion,
      rutaR2Privada: rutaPrivada,
      rutaR2Publica: rutaPublica,
      rutaMiniaturaPrivada: miniPrivada,
      rutaMiniaturaPublica: miniPublica,
      backendFotos: 'v3',
      operacionId
    };

    const pubFotos = pub0.fotos.filter((foto) => idFoto(foto) !== id);
    if (publicarPublica) pubFotos.push({ ...baseNova, publicarPublica: true });
    const priFotos = pri0.fotos.filter((foto) => idFoto(foto) !== id);
    if (publicarPrivada) priFotos.push({ ...baseNova, publicarPrivada: true });
    const revFotos = rev0.fotos.filter((foto) => idFoto(foto) !== id);
    const catMap = mapa(cat0.fotos, [baseNova]);

    const pub1 = preparar(pub0, pubFotos, operacionId);
    const pri1 = preparar(pri0, priFotos, operacionId);
    const rev1 = preparar(rev0, revFotos, operacionId);
    const cat1 = preparar(cat0, [...catMap.values()], operacionId);

    await Promise.all([
      gardar(env.R2_PUBLICO, INDEX_PUBLICO, pub1, true),
      gardar(env.R2_PRIVADO, INDEX_PRIVADO, pri1, false),
      gardar(env.R2_PRIVADO, INDEX_REVISION, rev1, false),
      gardar(env.R2_PRIVADO, CATALOGO, cat1, false)
    ]);

    try {
      await gardarSheet(env, usuario, {
        idFoto: id,
        ...metadatos,
        publicarPublica,
        publicarPrivada,
        rutaR2Publica: rutaPublica,
        rutaR2Privada: rutaPrivada
      });
    } catch (error) {
      await Promise.allSettled([
        gardar(env.R2_PUBLICO, INDEX_PUBLICO, pub0, true),
        gardar(env.R2_PRIVADO, INDEX_PRIVADO, pri0, false),
        gardar(env.R2_PRIVADO, INDEX_REVISION, rev0, false),
        gardar(env.R2_PRIVADO, CATALOGO, cat0, false)
      ]);
      await limparEdicion(env, edicion);
      throw error;
    }

    await env.R2_PRIVADO.delete(CACHE_REVISION).catch(() => {});

    return json(200, {
      ok: true,
      idFoto: id,
      ...metadatos,
      publicarPublica,
      publicarPrivada,
      estadoPublicacion,
      estadoXestion,
      imaxeActualizada: Boolean(edicion),
      backend: 'FOTOS-ADMIN-V3',
      permiso: permiso.fonte || 'R2-PERMISOS',
      tempoRespostaMs: Date.now() - inicio,
      mensaxe: edicion
        ? 'Imaxe, datos, Sheet e R2 gardados e verificados.'
        : 'Datos, publicación, Sheet e R2 gardados e verificados.'
    });
  } catch (error) {
    console.error('Erro no gardado de Fotografías v3:', error);
    return json(503, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non se puido completar a operación',
      tempoRespostaMs: Date.now() - inicio
    });
  }
}
