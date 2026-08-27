import { obterJsonAppsScript } from './apps-script.js';
import { onRequestFotosDeleteV4 } from './fotos-delete-v4.js';

const PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org';
const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const CATALOGO = 'indices/catalogo-fotos.json';
const CACHE_REVISION = 'cache/fotos/listar-revision.json';
const PHOTO_AUTH_PREFIX = 'cache/autorizacion-fotos/';
const ADMIN_AUTH_PREFIX = 'persoas/cache/administracion/';
const AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_CACHE_MS = 10 * 60 * 1000;

const tokenCache = new Map();
const texto = (valor) => String(valor ?? '').trim();
const idFoto = (foto) => texto(
  foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID']
);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-SCPP-Delete-Version': 'FOTOS-ADMIN-DELETE-V5-FAST-PREVIEW',
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
    while (tokenCache.size > 60) tokenCache.delete(tokenCache.keys().next().value);
    return usuario;
  } finally {
    clearTimeout(timer);
  }
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

  if (adminAuth) {
    const datos = await adminAuth.json().catch(() => null);
    const gardadoEn = Number(datos?.savedAt || 0);
    if (
      datos?.administrador === usuario.email &&
      datos?.payload?.ok === true &&
      datos?.payload?.perfil?.nivel === 'Administración' &&
      Number.isFinite(gardadoEn) &&
      Date.now() - gardadoEn < AUTH_TTL_MS
    ) return true;
  }

  if (fotoAuth) {
    const datos = await fotoAuth.json().catch(() => null);
    const verificadaEn = Date.parse(texto(datos?.verificadaEn));
    const mesmoCorreo = !datos?.email || texto(datos.email).toLowerCase() === usuario.email;
    if (
      datos?.administrador === true &&
      mesmoCorreo &&
      Number.isFinite(verificadaEn) &&
      Date.now() - verificadaEn < AUTH_TTL_MS
    ) return true;
  }
  return false;
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
    actualizadoDesde: `FOTOS-DELETE-V5-FAST-PREVIEW-${operacionId}`,
    version: '10'
  };
}

function rutasFoto(foto) {
  return new Set([
    foto?.rutaR2Publica,
    foto?.rutaR2_Publica,
    foto?.RutaR2_Publica,
    foto?.rutaR2Privada,
    foto?.rutaR2_Privada,
    foto?.RutaR2_Privada,
    foto?.rutaR2Traballo,
    foto?.rutaR2,
    foto?.RutaR2,
    foto?.rutaMiniaturaPublica,
    foto?.rutaMiniatura_Publica,
    foto?.RutaMiniaturaPublica,
    foto?.rutaMiniaturaPrivada,
    foto?.rutaMiniaturaRevision,
    foto?.rutaMiniatura_Privada,
    foto?.rutaMiniatura
  ].map(texto).filter(Boolean));
}

function fotoMarcadaPreview(head) {
  if (!head) return false;
  const meta = head.customMetadata || {};
  const backend = texto(meta.backend).toLowerCase();
  return texto(meta.previewClone).toLowerCase() === 'true' ||
    Boolean(texto(meta.previewCloneSourceEtag)) ||
    texto(meta.entorno || meta.environment || meta.env).toLowerCase() === 'preview' ||
    backend === 'fotos-administracion-v2' ||
    backend === 'fotos-administracion-v2-fast';
}

async function comprobarRutasPreview(env, rutas) {
  const claves = [...rutas];
  const comprobacions = await Promise.all(claves.flatMap((clave) => [
    env.R2_PRIVADO.head(clave).catch(() => null),
    env.R2_PUBLICO.head(clave).catch(() => null)
  ]));
  if (comprobacions.some(fotoMarcadaPreview)) return true;
  const erro = new Error('Borrado bloqueado: non se confirmou que os obxectos pertenzan aos buckets clonados de Preview.');
  erro.codigo = 'R2_PREVIEW_NOT_VERIFIED';
  throw erro;
}

async function chamarBorradoSheet(env, usuario, id) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'eliminarFotoAdministracionPortal',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto: id
  }, { timeoutMs: 24_000, attemptTimeoutMs: 24_000 });

  if (!resultado?.ok) {
    const erro = new Error(resultado?.erro || 'Non se puido eliminar a fotografía na Sheet de Preview.');
    erro.codigo = resultado?.codigo || '';
    throw erro;
  }
  if (resultado.entorno !== 'preview') {
    throw new Error('Apps Script non confirmou o entorno Preview.');
  }
  return resultado;
}

async function rollbackIndices(env, backup) {
  await Promise.allSettled([
    gardar(env.R2_PUBLICO, INDEX_PUBLICO, backup.pub, true),
    gardar(env.R2_PRIVADO, INDEX_PRIVADO, backup.pri, false),
    gardar(env.R2_PRIVADO, INDEX_REVISION, backup.rev, false),
    gardar(env.R2_PRIVADO, CATALOGO, backup.cat, false)
  ]);
}

async function eliminarPrefix(bucket, prefix) {
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    const keys = (page.objects || []).map((item) => item.key).filter(Boolean);
    if (keys.length) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

async function limpezaR2(env, id, rutasObxectivo, rutasRestantes) {
  try {
    const eliminables = [...rutasObxectivo].filter((clave) => !rutasRestantes.has(clave));
    await Promise.allSettled([
      eliminables.length ? env.R2_PUBLICO.delete(eliminables) : Promise.resolve(),
      eliminables.length ? env.R2_PRIVADO.delete(eliminables) : Promise.resolve(),
      eliminarPrefix(env.R2_PUBLICO, `fotos/editadas/${id}-`),
      eliminarPrefix(env.R2_PRIVADO, `fotos/editadas/${id}-`),
      eliminarPrefix(env.R2_PUBLICO, `fotos/editadas-miniaturas/${id}-`),
      eliminarPrefix(env.R2_PRIVADO, `fotos/editadas-miniaturas/${id}-`),
      env.R2_PRIVADO.delete(`fotos/traballo/${id}.json`),
      env.R2_PRIVADO.delete(`fotos/estado-edicion/${id}.json`),
      env.R2_PRIVADO.delete(`fotos/traballo-miniaturas/${id}.webp`),
      env.R2_PRIVADO.delete(`fotos/borradores/${id}`),
      env.R2_PRIVADO.delete(CACHE_REVISION)
    ]);
  } catch (error) {
    console.error('A fotografía xa foi eliminada, pero fallou parte da limpeza R2 en segundo plano:', error);
  }
}

export async function onRequestFotosDeleteV5FastPreview(context) {
  const { request, env } = context;
  const inicio = Date.now();
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });

  const host = new URL(request.url).hostname.toLowerCase();
  if (host !== PREVIEW_HOST) {
    return json(403, { ok: false, erro: 'O borrado rápido de Preview non está habilitado neste dominio.' });
  }
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PUBLICO || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O borrado de fotografías de Preview non está configurado.' });
  }

  let datos;
  try { datos = await request.clone().json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const id = texto(datos.idFoto || datos.rowId);
  if (!id) return json(400, { ok: false, erro: 'Falta identificar a fotografía.' });

  const usuario = await verificarToken(datos.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  // Apps Script volve comprobar a autorización no momento destrutivo.
  // A caché evita a chamada previa redundante que alongaba a resposta.
  if (!(await administracionCacheada(env, usuario))) {
    return onRequestFotosDeleteV4(context);
  }

  let backup = null;
  let indicesActualizados = false;
  try {
    const [pub0, pri0, rev0, cat0] = await Promise.all([
      ler(env.R2_PUBLICO, INDEX_PUBLICO),
      ler(env.R2_PRIVADO, INDEX_PRIVADO),
      ler(env.R2_PRIVADO, INDEX_REVISION),
      ler(env.R2_PRIVADO, CATALOGO)
    ]);
    backup = { pub: pub0, pri: pri0, rev: rev0, cat: cat0 };

    const todas = [...pub0.fotos, ...pri0.fotos, ...rev0.fotos, ...cat0.fotos];
    const obxectivo = todas.filter((foto) => idFoto(foto) === id);
    if (!obxectivo.length) return onRequestFotosDeleteV4(context);

    const rutasObxectivo = new Set(obxectivo.flatMap((foto) => [...rutasFoto(foto)]));
    if (!rutasObxectivo.size) return onRequestFotosDeleteV4(context);

    try {
      await comprobarRutasPreview(env, rutasObxectivo);
    } catch (error) {
      if (texto(error?.codigo) === 'R2_PREVIEW_NOT_VERIFIED') return onRequestFotosDeleteV4(context);
      throw error;
    }

    const operacionId = crypto.randomUUID();
    const filtrar = (indice) => indice.fotos.filter((foto) => idFoto(foto) !== id);
    const pubNovo = preparar(pub0, filtrar(pub0), operacionId);
    const priNovo = preparar(pri0, filtrar(pri0), operacionId);
    const revNovo = preparar(rev0, filtrar(rev0), operacionId);
    const catNovo = preparar(cat0, filtrar(cat0), operacionId);

    await Promise.all([
      gardar(env.R2_PUBLICO, INDEX_PUBLICO, pubNovo, true),
      gardar(env.R2_PRIVADO, INDEX_PRIVADO, priNovo, false),
      gardar(env.R2_PRIVADO, INDEX_REVISION, revNovo, false),
      gardar(env.R2_PRIVADO, CATALOGO, catNovo, false)
    ]);
    indicesActualizados = true;

    let sheet;
    try {
      sheet = await chamarBorradoSheet(env, usuario, id);
    } catch (error) {
      await rollbackIndices(env, backup);
      indicesActualizados = false;
      throw error;
    }

    const restantes = [...pubNovo.fotos, ...priNovo.fotos, ...revNovo.fotos, ...catNovo.fotos];
    const rutasRestantes = new Set(restantes.flatMap((foto) => [...rutasFoto(foto)]));
    const limpeza = limpezaR2(env, id, rutasObxectivo, rutasRestantes);
    if (typeof context.waitUntil === 'function') context.waitUntil(limpeza);
    else await limpeza;

    return json(200, {
      ok: true,
      idFoto: id,
      backend: 'FOTOS-ADMIN-DELETE-V5-FAST-PREVIEW',
      entorno: 'preview',
      sheet,
      limpezaR2: 'segundo-plano',
      tempoRespostaMs: Date.now() - inicio,
      mensaxe: sheet?.avisoDrive || 'Fotografía eliminada definitivamente de Preview.'
    });
  } catch (error) {
    if (indicesActualizados && backup) await rollbackIndices(env, backup);
    return json(503, {
      ok: false,
      codigo: texto(error?.codigo),
      erro: error instanceof Error ? error.message : 'Non se puido completar o borrado.',
      tempoRespostaMs: Date.now() - inicio
    });
  }
}
