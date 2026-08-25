import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const CATALOGO = 'indices/catalogo-fotos.json';
const CACHE_REVISION = 'cache/fotos/listar-revision.json';
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const TIPOS_IMAXE = new Set(['image/jpeg', 'image/png', 'image/webp']);

const texto = (valor) => String(valor ?? '').trim();
const idFoto = (foto) => texto(
  foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID']
);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarToken(idToken, apiKey) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  return user?.email && user.emailVerified === true
    ? { uid: texto(user.localId), email: texto(user.email).toLowerCase() }
    : null;
}

async function claveCorreo(email) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(texto(email).toLowerCase())
  );
  return [...new Uint8Array(hash)]
    .map((valor) => valor.toString(16).padStart(2, '0'))
    .join('');
}

async function comprobarAdmin(env, usuario) {
  const cached = await env.R2_PRIVADO.get(
    `cache/autorizacion-fotos/${await claveCorreo(usuario.email)}.json`
  );
  if (cached) {
    const datos = await cached.json().catch(() => null);
    const verificadaEn = Date.parse(texto(datos?.verificadaEn));
    if (
      datos?.administrador === true &&
      Number.isFinite(verificadaEn) &&
      Date.now() - verificadaEn < AUTH_TTL_MS
    ) {
      return;
    }
  }

  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });

  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Administración non autorizada');
  }
}

async function listarRevision(env, usuario) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 50_000, attemptTimeoutMs: 18_000 });
  return resultado?.ok && Array.isArray(resultado.fotos) ? resultado.fotos : [];
}

async function ler(bucket, clave) {
  const object = await bucket.get(clave);
  if (!object) return { ok: true, fotos: [], total: 0 };
  const datos = await object.json().catch(() => null);
  if (!datos || !Array.isArray(datos.fotos)) {
    throw new Error(`Índice non válido: ${clave}`);
  }
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

function preparar(indice, fotos, orixe) {
  const agora = new Date();
  return {
    ...indice,
    ok: true,
    fotos,
    total: fotos.length,
    xeradoEn: agora.toISOString(),
    xeradoEnMs: agora.getTime(),
    actualizadoDesde: orixe,
    version: '7'
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
  return texto(
    tipo === 'publica'
      ? (foto?.rutaR2Publica || foto?.rutaR2)
      : (foto?.rutaR2Privada || foto?.rutaR2Traballo || foto?.rutaR2)
  );
}

function rutaMiniatura(foto, tipo) {
  return texto(
    tipo === 'publica'
      ? (foto?.rutaMiniaturaPublica || foto?.rutaMiniatura)
      : (foto?.rutaMiniaturaPrivada || foto?.rutaMiniaturaRevision || foto?.rutaMiniatura)
  );
}

function estadoRevision(foto) {
  return texto(foto?.estadoRevision || foto?.EstadoRevision || foto?.estado || foto?.Estado).toLowerCase();
}

function fichaEstado(foto, publicas, privadas) {
  const id = idFoto(foto);
  const publica = publicas.has(id);
  const privada = privadas.has(id);
  const revision = estadoRevision(foto);
  const estadoPublicacion = publica && privada
    ? 'ambas'
    : publica
      ? 'publica'
      : privada
        ? 'privada'
        : 'ningunha';
  let estadoXestion = 'nonpublicada';
  if (publica || privada) estadoXestion = 'publicada';
  else if (revision.includes('rexe') || revision.includes('rechaz')) estadoXestion = 'rexeitada';
  else if (!revision || revision.includes('pend') || revision.includes('revision') || revision.includes('revisión')) estadoXestion = 'pendente';
  return {
    ...foto,
    idFoto: id,
    publicarPublica: publica,
    publicarPrivada: privada,
    estadoPublicacion,
    estadoXestion,
    estadoRevision: revision
  };
}

async function gardarMetadatosSheet(env, usuario, id, datos) {
  const { resultado } = await obterJsonAppsScript(env, {
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
  }, { timeoutMs: 60_000, attemptTimeoutMs: 20_000 });
  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non se puideron gardar os datos da fotografía');
  }
}

async function sincronizarPublicacionSheet(env, usuario, id, publica, privada) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'actualizarPublicacionFoto',
    email: usuario.email,
    uidFirebase: usuario.uid,
    rowId: id,
    idFoto: id,
    publicarPublica: publica,
    publicarPrivada: privada,
    destacadaPublica: false,
    destacadaPrivada: false
  }, { timeoutMs: 60_000, attemptTimeoutMs: 20_000 });
  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non se puido actualizar a publicación na Sheet');
  }
}

async function gardarRutasSheet(env, usuario, id, rutaPublica, rutaPrivada) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'gardarRutasFotoR2',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto: id,
    rowId: id,
    rutaPublica,
    rutaPrivada
  }, { timeoutMs: 60_000, attemptTimeoutMs: 20_000 });
  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non se puideron gardar as rutas R2 na Sheet');
  }
}

function decodificarBase64(base64, maxBytes, etiqueta) {
  const raw = texto(base64);
  if (!raw) return null;
  const binario = atob(raw);
  if (!binario.length || binario.length > Math.ceil(maxBytes * 4 / 3) + 32) {
    throw new Error(`${etiqueta} supera o tamaño máximo permitido.`);
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  if (bytes.byteLength > maxBytes) throw new Error(`${etiqueta} supera o tamaño máximo permitido.`);
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
      editadaEn: new Date().toISOString()
    }
  });
}

async function asegurarCopia(bucketDestino, bucketFonte, clave) {
  if (!clave) return;
  const existe = await bucketDestino.head(clave);
  if (existe) return;
  const source = await bucketFonte.get(clave);
  if (!source) throw new Error(`Non se atopou o ficheiro R2 necesario: ${clave}`);
  const bytes = await source.arrayBuffer();
  await bucketDestino.put(clave, bytes, {
    httpMetadata: {
      contentType: texto(source.httpMetadata?.contentType) || 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });
}

async function escribirEstadoEdicion(env, id, datos) {
  await env.R2_PRIVADO.put(`fotos/estado-edicion/${id}.json`, JSON.stringify({
    idFoto: id,
    ...datos,
    actualizadoEn: new Date().toISOString()
  }), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, no-store'
    }
  });
}

async function prepararEdicion(env, usuario, id, datos, publica) {
  const base64 = texto(datos.base64);
  if (!base64) return null;

  const mimeType = texto(datos.mimeType || 'image/jpeg').toLowerCase();
  if (!TIPOS_IMAXE.has(mimeType)) throw new Error('O formato da fotografía editada non é válido.');
  const bytes = decodificarBase64(base64, MAX_IMAGE_BYTES, 'A fotografía editada');
  const thumbMimeType = texto(datos.miniaturaMimeType || 'image/jpeg').toLowerCase();
  const thumbBytes = texto(datos.miniaturaBase64)
    ? decodificarBase64(datos.miniaturaBase64, MAX_THUMB_BYTES, 'A miniatura')
    : null;
  if (thumbBytes && !TIPOS_IMAXE.has(thumbMimeType)) {
    throw new Error('O formato da miniatura non é válido.');
  }

  const marca = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const op = crypto.randomUUID();
  const rutaPrivada = `fotos/editadas/${id}-${marca}-${op.slice(0, 8)}.${extensionMime(mimeType)}`;
  const rutaPublica = publica ? rutaPrivada : '';
  const rutaMiniaturaPrivada = thumbBytes
    ? `fotos/editadas-miniaturas/${id}-${marca}-${op.slice(0, 8)}.${extensionMime(thumbMimeType)}`
    : '';
  const rutaMiniaturaPublica = publica ? rutaMiniaturaPrivada : '';

  await escribirImaxe(env.R2_PRIVADO, rutaPrivada, bytes, mimeType, usuario, id, 'edicion-integrada', false);
  if (publica) {
    await escribirImaxe(env.R2_PUBLICO, rutaPublica, bytes, mimeType, usuario, id, 'edicion-integrada', true);
  }
  if (thumbBytes) {
    await escribirImaxe(env.R2_PRIVADO, rutaMiniaturaPrivada, thumbBytes, thumbMimeType, usuario, id, 'miniatura-edicion', false);
    if (publica) {
      await escribirImaxe(env.R2_PUBLICO, rutaMiniaturaPublica, thumbBytes, thumbMimeType, usuario, id, 'miniatura-edicion', true);
    }
  }

  return {
    op,
    mimeType,
    rutaPrivada,
    rutaPublica,
    rutaMiniaturaPrivada,
    rutaMiniaturaPublica,
    novasClavesPrivadas: [rutaPrivada, rutaMiniaturaPrivada].filter(Boolean),
    novasClavesPublicas: [rutaPublica, rutaMiniaturaPublica].filter(Boolean)
  };
}

async function borrarNovasClaves(env, edicion) {
  if (!edicion) return;
  await Promise.allSettled([
    ...edicion.novasClavesPrivadas.map((clave) => env.R2_PRIVADO.delete(clave)),
    ...edicion.novasClavesPublicas.map((clave) => env.R2_PUBLICO.delete(clave))
  ]);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PUBLICO || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'Servizo non configurado' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const usuario = await verificarToken(texto(datos.idToken), env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'Identificación non válida ou caducada' });

  let edicion = null;
  try {
    await comprobarAdmin(env, usuario);
    const accion = texto(datos.accion || 'listar');
    const [pub0, pri0, rev0, cat0] = await Promise.all([
      ler(env.R2_PUBLICO, INDEX_PUBLICO),
      ler(env.R2_PRIVADO, INDEX_PRIVADO),
      ler(env.R2_PRIVADO, INDEX_REVISION),
      ler(env.R2_PRIVADO, CATALOGO)
    ]);

    const tenCatalogoR2 = cat0.fotos.length > 0 || pub0.fotos.length > 0 || pri0.fotos.length > 0 || rev0.fotos.length > 0;
    const revisionFallback = accion === 'listar' && !tenCatalogoR2 ? await listarRevision(env, usuario) : [];
    const mp = mapa(rev0.fotos, pub0.fotos, pri0.fotos, cat0.fotos, revisionFallback);
    const idsPub = new Set(pub0.fotos.map(idFoto));
    const idsPri = new Set(pri0.fotos.map(idFoto));

    if (accion === 'listar') {
      const fotos = [...mp.values()]
        .map((foto) => fichaEstado(foto, idsPub, idsPri))
        .sort((a, b) => texto(a.titulo || a.peFoto || a.idFoto).localeCompare(
          texto(b.titulo || b.peFoto || b.idFoto),
          'gl'
        ));
      await gardar(env.R2_PRIVADO, CATALOGO, preparar(cat0, fotos, 'CATALOGO-FOTOS'));
      const conta = (tipo) => fotos.filter((foto) => foto.estadoXestion === tipo).length;
      return json(200, {
        ok: true,
        fotos,
        total: fotos.length,
        publicas: idsPub.size,
        privadas: idsPri.size,
        publicadas: conta('publicada'),
        nonPublicadas: conta('nonpublicada'),
        pendentes: conta('pendente'),
        rexeitadas: conta('rexeitada')
      });
    }

    if (accion !== 'gardar') return json(400, { ok: false, erro: 'Acción non permitida' });

    const id = texto(datos.idFoto);
    if (!id || !mp.has(id)) return json(404, { ok: false, erro: 'Fotografía non localizada no catálogo' });

    const publica = datos.publicarPublica === true;
    const privada = datos.publicarPrivada === true;
    const base = mp.get(id);
    const operacionId = crypto.randomUUID();
    const metadatos = {
      titulo: texto(datos.titulo ?? base.titulo),
      peFoto: texto(datos.peFoto ?? base.peFoto),
      observacions: texto(datos.observacions ?? base.observacions)
    };

    edicion = await prepararEdicion(env, usuario, id, datos, publica);

    let rutaPrivadaNova = edicion?.rutaPrivada || ruta(base, 'privada') || ruta(base, 'publica');
    let rutaPublicaNova = edicion?.rutaPublica || ruta(base, 'publica') || rutaPrivadaNova;
    let miniaturaPrivadaNova = edicion?.rutaMiniaturaPrivada || rutaMiniatura(base, 'privada');
    let miniaturaPublicaNova = edicion?.rutaMiniaturaPublica || rutaMiniatura(base, 'publica');

    if (privada && !rutaPrivadaNova) {
      throw new Error('A fotografía non ten ruta R2 recuperable para a galería privada');
    }
    if (publica && !rutaPublicaNova) {
      throw new Error('A fotografía non ten ruta R2 recuperable para a galería pública');
    }

    if (!edicion) {
      if (privada && !(await env.R2_PRIVADO.head(rutaPrivadaNova))) {
        await asegurarCopia(env.R2_PRIVADO, env.R2_PUBLICO, rutaPrivadaNova);
      }
      if (publica && !(await env.R2_PUBLICO.head(rutaPublicaNova))) {
        const fonte = ruta(base, 'privada') || rutaPublicaNova;
        rutaPublicaNova = fonte;
        await asegurarCopia(env.R2_PUBLICO, env.R2_PRIVADO, fonte);
      }
    }

    const estadoPublicacion = publica && privada
      ? 'ambas'
      : publica
        ? 'publica'
        : privada
          ? 'privada'
          : 'ningunha';
    const estadoXestion = publica || privada ? 'publicada' : 'nonpublicada';

    const baseNova = {
      ...base,
      ...metadatos,
      idFoto: id,
      estadoRevision: 'aprobada',
      estado: 'Aprobada',
      publicarPublica: publica,
      publicarPrivada: privada,
      estadoPublicacion,
      estadoXestion,
      rutaR2Privada: rutaPrivadaNova,
      rutaR2Publica: publica ? rutaPublicaNova : '',
      rutaMiniaturaPrivada: miniaturaPrivadaNova,
      rutaMiniaturaPublica: publica ? miniaturaPublicaNova : '',
      etagOrixinal: edicion?.op || texto(base.etagOrixinal || operacionId)
    };

    const fotoPub = {
      ...baseNova,
      rutaR2Publica: rutaPublicaNova,
      publicarPublica: true,
      publicarPrivada: privada
    };
    const fotoPri = {
      ...baseNova,
      rutaR2Privada: rutaPrivadaNova,
      publicarPrivada: true,
      publicarPublica: publica
    };

    const pubFotos = pub0.fotos.filter((foto) => idFoto(foto) !== id);
    if (publica) pubFotos.push(fotoPub);
    const priFotos = pri0.fotos.filter((foto) => idFoto(foto) !== id);
    if (privada) priFotos.push(fotoPri);
    const revFotos = rev0.fotos.filter((foto) => idFoto(foto) !== id);
    const catMap = mapa(cat0.fotos, [baseNova]);

    const pub1 = preparar(pub0, pubFotos, `XESTOR-FOTOS-${operacionId}`);
    const pri1 = preparar(pri0, priFotos, `XESTOR-FOTOS-${operacionId}`);
    const rev1 = preparar(rev0, revFotos, `XESTOR-FOTOS-${operacionId}`);
    const cat1 = preparar(cat0, [...catMap.values()], `XESTOR-FOTOS-${operacionId}`);

    await Promise.all([
      gardar(env.R2_PUBLICO, INDEX_PUBLICO, pub1, true),
      gardar(env.R2_PRIVADO, INDEX_PRIVADO, pri1, false),
      gardar(env.R2_PRIVADO, INDEX_REVISION, rev1, false),
      gardar(env.R2_PRIVADO, CATALOGO, cat1, false)
    ]);

    try {
      await gardarMetadatosSheet(env, usuario, id, metadatos);
      await sincronizarPublicacionSheet(env, usuario, id, publica, privada);
      if (edicion) {
        await gardarRutasSheet(
          env,
          usuario,
          id,
          publica ? rutaPublicaNova : '',
          rutaPrivadaNova
        );
        await escribirEstadoEdicion(env, id, {
          estado: 'sincronizada',
          tipo: 'edicion-integrada',
          rutaPublica: publica ? rutaPublicaNova : '',
          rutaPrivada: rutaPrivadaNova,
          mimeType: edicion.mimeType
        });
      }
    } catch (error) {
      await Promise.allSettled([
        gardar(env.R2_PUBLICO, INDEX_PUBLICO, pub0, true),
        gardar(env.R2_PRIVADO, INDEX_PRIVADO, pri0, false),
        gardar(env.R2_PRIVADO, INDEX_REVISION, rev0, false),
        gardar(env.R2_PRIVADO, CATALOGO, cat0, false)
      ]);
      await borrarNovasClaves(env, edicion);
      throw error;
    }

    await env.R2_PRIVADO.delete(CACHE_REVISION);

    const [pubVerificado, priVerificado, revVerificado, catVerificado] = await Promise.all([
      ler(env.R2_PUBLICO, INDEX_PUBLICO),
      ler(env.R2_PRIVADO, INDEX_PRIVADO),
      ler(env.R2_PRIVADO, INDEX_REVISION),
      ler(env.R2_PRIVADO, CATALOGO)
    ]);
    const fotoPublica = pubVerificado.fotos.find((foto) => idFoto(foto) === id);
    const fotoPrivada = priVerificado.fotos.find((foto) => idFoto(foto) === id);
    const fotoRevision = revVerificado.fotos.find((foto) => idFoto(foto) === id);
    const fotoCatalogo = catVerificado.fotos.find((foto) => idFoto(foto) === id);

    if (Boolean(fotoPublica) !== publica || Boolean(fotoPrivada) !== privada) {
      throw new Error('A verificación final non coincide co estado de publicación solicitado');
    }
    if (fotoRevision) {
      throw new Error('A fotografía segue figurando como pendente despois de gardar');
    }
    if (!fotoCatalogo || texto(fotoCatalogo.titulo) !== metadatos.titulo) {
      throw new Error('O catálogo R2 non reflicte os datos gardados');
    }
    if (edicion) {
      if (texto(fotoCatalogo.rutaR2Privada) !== rutaPrivadaNova) {
        throw new Error('O catálogo R2 non apunta á versión editada');
      }
      if (publica && texto(fotoPublica?.rutaR2Publica) !== rutaPublicaNova) {
        throw new Error('A galería pública non apunta á versión editada');
      }
    }

    return json(200, {
      ok: true,
      idFoto: id,
      ...metadatos,
      publicarPublica: publica,
      publicarPrivada: privada,
      estadoPublicacion,
      estadoXestion,
      imaxeActualizada: Boolean(edicion),
      rutaR2Privada: rutaPrivadaNova,
      rutaR2Publica: publica ? rutaPublicaNova : '',
      rutaMiniaturaPrivada: miniaturaPrivadaNova,
      rutaMiniaturaPublica: publica ? miniaturaPublicaNova : '',
      mensaxe: edicion
        ? 'Imaxe, miniatura, datos, Sheet e índices R2 actualizados e verificados.'
        : 'Datos e publicación actualizados e verificados en Sheet, R2 e caché.'
    });
  } catch (error) {
    console.error('Erro no xestor fotográfico', error);
    return json(503, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non se puido completar a operación'
    });
  }
}
