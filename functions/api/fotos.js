import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;
const LISTA_INDEX_PATH = 'indices/revision-fotos-v1.json';
const LISTA_CACHE_PATH = 'cache/fotos/listar-revision.json';
const LISTA_FRESH_MS = 5 * 60 * 1000;
const LISTA_STALE_MS = 24 * 60 * 60 * 1000;
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;
const AUTH_CACHE_VERSION = 2;
const FIREBASE_TOKEN_CACHE_MS = 5 * 60 * 1000;
const firebaseTokenCache = new Map();

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

function limparFirebaseTokenCache(maximo = 100) {
  const agora = Date.now();
  for (const [token, entrada] of firebaseTokenCache.entries()) {
    if (!entrada || Number(entrada.expira || 0) <= agora) firebaseTokenCache.delete(token);
  }
  while (firebaseTokenCache.size > maximo) {
    firebaseTokenCache.delete(firebaseTokenCache.keys().next().value);
  }
}

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;

  const cached = firebaseTokenCache.get(token);
  if (cached?.expira > Date.now()) return cached.usuario;

  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    }
  );
  if (!resposta.ok) {
    firebaseTokenCache.delete(token);
    return null;
  }
  const usuarioFirebase = (await resposta.json())?.users?.[0];
  if (!usuarioFirebase?.email || usuarioFirebase.emailVerified !== true) {
    firebaseTokenCache.delete(token);
    return null;
  }
  const usuario = {
    uid: String(usuarioFirebase.localId || ''),
    email: String(usuarioFirebase.email).trim().toLowerCase()
  };
  firebaseTokenCache.set(token, {
    usuario,
    expira: Date.now() + FIREBASE_TOKEN_CACHE_MS
  });
  limparFirebaseTokenCache();
  return usuario;
}

async function claveCorreo(email) {
  const datos = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)]
    .map((valor) => valor.toString(16).padStart(2, '0'))
    .join('');
}

async function comprobarAutorizacionCache(env, usuario) {
  if (!env.R2_PRIVADO) return false;
  const clave = await claveCorreo(usuario.email);
  const obxecto = await env.R2_PRIVADO.get(`cache/autorizacion-fotos/${clave}.json`);
  if (!obxecto) return false;
  const datos = await obxecto.json().catch(() => null);
  const verificadaEn = Date.parse(String(datos?.verificadaEn || ''));
  return datos?.version === AUTH_CACHE_VERSION &&
    datos?.administrador === true && Number.isFinite(verificadaEn) &&
    Date.now() - verificadaEn < AUTH_TTL_MS;
}

async function gardarAutorizacionCache(env, usuario) {
  if (!env.R2_PRIVADO) return;
  const clave = await claveCorreo(usuario.email);
  await env.R2_PRIVADO.put(
    `cache/autorizacion-fotos/${clave}.json`,
    JSON.stringify({
      version: AUTH_CACHE_VERSION,
      administrador: true,
      email: usuario.email,
      verificadaEn: new Date().toISOString()
    }),
    {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'private, max-age=43200'
      }
    }
  );
}

async function lerListaCache(env) {
  if (!env.R2_PRIVADO) return null;

  const indice = await env.R2_PRIVADO.get(LISTA_INDEX_PATH);
  if (indice) {
    const datos = await indice.json().catch(() => null);
    const xeradaEn = Number(datos?.xeradoEnMs) || Date.parse(String(datos?.xeradoEn || ''));
    if (datos?.ok === true && Array.isArray(datos?.fotos) && Number.isFinite(xeradaEn)) {
      return {
        resultado: datos,
        idadeMs: Math.max(0, Date.now() - xeradaEn),
        fonte: 'INDICE-R2'
      };
    }
  }

  const obxecto = await env.R2_PRIVADO.get(LISTA_CACHE_PATH);
  if (!obxecto) return null;
  const datos = await obxecto.json().catch(() => null);
  const gardadaEn = Date.parse(String(datos?.gardadaEn || ''));
  if (!datos?.resultado?.ok || !Number.isFinite(gardadaEn)) return null;
  return {
    resultado: datos.resultado,
    idadeMs: Math.max(0, Date.now() - gardadaEn),
    fonte: 'CACHE-R2'
  };
}

async function gardarListaCache(env, resultado) {
  if (!env.R2_PRIVADO || !resultado?.ok) return;
  await env.R2_PRIVADO.put(
    LISTA_CACHE_PATH,
    JSON.stringify({ gardadaEn: new Date().toISOString(), resultado }),
    {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'private, max-age=300'
      }
    }
  );
}

async function invalidarListaCache(env) {
  if (env.R2_PRIVADO) await env.R2_PRIVADO.delete(LISTA_CACHE_PATH);
}

function decodificarBase64(base64) {
  const binario = atob(String(base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function extensionPorMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function gardarFotoEnR2(env, resultado) {
  if (!env.R2_PUBLICO || !env.R2_PRIVADO) throw new Error('Os buckets R2 non están configurados.');

  const idFoto = String(resultado.idFoto || resultado.rowId || '').trim();
  const mimeType = String(resultado.mimeType || '').trim().toLowerCase();
  const base64 = String(resultado.base64 || '').trim();
  if (!idFoto || !TIPOS.has(mimeType) || !base64) {
    throw new Error('Apps Script non devolveu unha fotografía válida para R2.');
  }

  const bytes = decodificarBase64(base64);
  if (bytes.byteLength > MAX_BYTES) throw new Error('A fotografía supera o máximo de 8 MB.');

  const extension = extensionPorMime(mimeType);
  const rutas = {};
  const metadata = {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: { idFoto, orixe: 'google-drive' }
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
  if (!rutas.publica && !rutas.privada) throw new Error('A fotografía non está publicada en ningunha galería.');
  return rutas;
}

async function migrarFotoPublicada(env, usuario, idFoto) {
  const identificador = String(idFoto || '').trim();
  if (!identificador) throw new Error('Non se puido determinar o identificador da fotografía publicada.');

  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'obterFotoParaR2',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto: identificador,
    rowId: identificador
  }, { timeoutMs: 75_000, attemptTimeoutMs: 25_000 });

  if (!resultado?.ok) throw new Error(resultado?.erro || 'Non se puido obter a fotografía para copiala a R2.');
  const rutas = await gardarFotoEnR2(env, resultado);
  const idGardado = String(resultado.idFoto || resultado.rowId || identificador).trim();

  const { resultado: gardado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'gardarRutasFotoR2',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto: idGardado,
    rutaPublica: String(rutas.publica || ''),
    rutaPrivada: String(rutas.privada || '')
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });

  if (!gardado?.ok) throw new Error(gardado?.erro || 'A foto copiose a R2, pero non se puideron gardar as rutas na folla Fotos.');
  return { idFoto: idGardado, rutas };
}

async function solicitarListaRevision(env, usuario) {
  const { resultado, usouRespaldo } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });

  if (!resultado?.ok) throw new Error(resultado?.erro || 'Non foi posible cargar as fotografías pendentes.');
  if (Object.prototype.hasOwnProperty.call(resultado || {}, 'administrador') && resultado?.administrador !== true) {
    throw new Error('Administración non autorizada');
  }
  await Promise.all([
    gardarListaCache(env, resultado),
    gardarAutorizacionCache(env, usuario)
  ]);
  return { resultado, usouRespaldo };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const idToken = String(datos.idToken || '').trim();
  let usuario;
  try { usuario = idToken && await verificarTokenFirebase(idToken, env.FIREBASE_API_KEY); }
  catch (erro) { console.error('Erro ao validar Firebase:', erro); }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || 'subirFoto').trim();
  const accionsPermitidas = new Set([
    'subirFoto', 'listarFotosRevision', 'actualizarRevisionFoto', 'listarFotosGaleria',
    'obterFotoGaleria', 'listarFotosPublicadas', 'actualizarPublicacionFoto',
    'listarFotosPendentesR2', 'migrarFotoR2'
  ]);
  if (!accionsPermitidas.has(accion)) return json(400, { ok: false, erro: 'Acción non permitida' });

  if (accion === 'listarFotosRevision') {
    const inicio = Date.now();
    const [autorizadoEnCache, cache] = await Promise.all([
      comprobarAutorizacionCache(env, usuario),
      lerListaCache(env)
    ]);

    if (autorizadoEnCache && cache) {
      const fresca = cache.idadeMs <= LISTA_FRESH_MS;
      if (!fresca && typeof context.waitUntil === 'function') {
        context.waitUntil(
          solicitarListaRevision(env, usuario).catch((erro) => {
            console.error('Non se puido actualizar en segundo plano a lista de fotografías:', erro);
          })
        );
      }
      return json(200, cache.resultado, {
        'X-SCPP-Cache': fresca ? 'HIT' : 'STALE-WHILE-REVALIDATE',
        'X-SCPP-Cache-Age': String(Math.round(cache.idadeMs / 1000)),
        'X-SCPP-Storage': cache.fonte || 'R2',
        'Warning': fresca ? '' : '110 - Response is stale',
        'Server-Timing': `r2;dur=${Date.now() - inicio}`
      });
    }

    try {
      const { resultado, usouRespaldo } = await solicitarListaRevision(env, usuario);
      return json(200, resultado, {
        'X-SCPP-Cache': cache ? 'REFRESH' : 'MISS',
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
        'Server-Timing': `appscript;dur=${Date.now() - inicio}`
      });
    } catch (erro) {
      if (
        erro instanceof Error &&
        erro.message === 'Administración non autorizada'
      ) {
        return json(403, { ok: false, erro: 'Administración non autorizada' });
      }

      if (autorizadoEnCache && cache && cache.idadeMs <= LISTA_STALE_MS) {
        return json(200, cache.resultado, {
          'X-SCPP-Cache': 'STALE',
          'X-SCPP-Cache-Age': String(Math.round(cache.idadeMs / 1000)),
          'X-SCPP-AppScript': 'ERROR',
          'Warning': '110 - Response is stale',
          'Server-Timing': `r2-stale;dur=${Date.now() - inicio}`
        });
      }

      const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
      return json(status, {
        ok: false,
        erro: erro instanceof Error ? erro.message : 'O servizo de fotografías non está dispoñible.'
      });
    }
  }

  const tipo = String(datos.tipo || '').toLowerCase();
  const base64 = String(datos.base64 || '');
  if (accion === 'subirFoto') {
    if (!String(datos.titulo || '').trim() || !String(datos.nomeFicheiro || '').trim() || !base64 || !TIPOS.has(tipo)) {
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
    const { resultado, usouRespaldo } = await obterJsonAppsScript(env, corpo, {
      timeoutMs: pesada ? 75_000 : 35_000,
      attemptTimeoutMs: pesada ? 25_000 : 12_000
    });

    if (!resultado?.ok) {
      return json(resultado?.erro === 'Usuario non autorizado' ? 403 : 400, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible completar a operación de fotografías.'
      });
    }

    if (accion === 'migrarFotoR2') {
      const migrada = await migrarFotoPublicada(env, usuario,
        String(resultado.idFoto || resultado.rowId || corpo.idFoto || corpo.rowId).trim());
      await invalidarListaCache(env);
      return json(200, { ok: true, ...migrada, mensaxe: 'Fotografía copiada a R2 e rutas gardadas correctamente' });
    }

    const debeMigrarTrasPublicar = accion === 'actualizarRevisionFoto' &&
      corpo.estado.toLowerCase() === 'aprobada' && (corpo.publicarPublica || corpo.publicarPrivada);

    if (debeMigrarTrasPublicar) {
      const identificador = String(resultado.idFoto || resultado.rowId || corpo.idFoto || corpo.rowId).trim();
      const migrada = await migrarFotoPublicada(env, usuario, identificador);
      await invalidarListaCache(env);
      return json(200, {
        ...resultado,
        ok: true,
        idFoto: migrada.idFoto,
        rutasR2: migrada.rutas,
        mensaxe: 'Fotografía aprobada, copiada a R2 e publicada correctamente'
      });
    }

    if (accion === 'actualizarRevisionFoto' || accion === 'actualizarPublicacionFoto' || accion === 'subirFoto') {
      await invalidarListaCache(env);
    }

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': accion === 'listarFotosGaleria' ? 'private, max-age=120' : 'no-store',
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