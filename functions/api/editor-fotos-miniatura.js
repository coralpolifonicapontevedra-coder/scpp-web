import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const CATALOGO = 'indices/catalogo-fotos.json';
const PHOTO_AUTH_PREFIX = 'cache/autorizacion-fotos/';
const ADMIN_AUTH_PREFIX = 'persoas/cache/administracion/';
const REVISION_CACHE_PREFIX = 'fotos/revision-cache/';
const AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_CACHE_VERSION = 2;
const MAX_DRIVE_BYTES = 8 * 1024 * 1024;

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

async function verificarTokenFirebase(idToken, apiKey) {
  if (!idToken || !apiKey) return null;
  const resposta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return {
    uid: texto(usuario.localId),
    email: texto(usuario.email).toLowerCase()
  };
}

async function claveCorreo(email) {
  const datos = new TextEncoder().encode(texto(email).toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((valor) => valor.toString(16).padStart(2, '0')).join('');
}

async function administracionCacheada(env, usuario) {
  if (!env.R2_PRIVADO || !usuario?.email) return false;
  const clave = await claveCorreo(usuario.email);
  const [fotoAuth, adminAuth] = await Promise.all([
    env.R2_PRIVADO.get(`${PHOTO_AUTH_PREFIX}${clave}.json`),
    env.R2_PRIVADO.get(`${ADMIN_AUTH_PREFIX}${clave}.json`)
  ]);

  if (fotoAuth) {
    const datos = await fotoAuth.json().catch(() => null);
    const verificadaEn = Date.parse(texto(datos?.verificadaEn));
    const versionCompatible = datos?.version == null || datos.version === AUTH_CACHE_VERSION;
    const mesmoCorreo = !datos?.email || texto(datos.email).toLowerCase() === usuario.email;
    if (
      versionCompatible &&
      mesmoCorreo &&
      datos?.administrador === true &&
      Number.isFinite(verificadaEn) &&
      Date.now() - verificadaEn < AUTH_TTL_MS
    ) return true;
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
    ) return true;
  }

  return false;
}

async function lerIndice(bucket, clave) {
  if (!bucket) return { fotos: [], raw: null };
  const obxecto = await bucket.get(clave);
  if (!obxecto) return { fotos: [], raw: null };
  const indice = await obxecto.json().catch(() => null);
  return {
    fotos: Array.isArray(indice?.fotos) ? indice.fotos : [],
    raw: indice
  };
}

function localizarFoto(id, lista) {
  return (lista || []).find((item) => idFoto(item) === id) || null;
}

function rutasCandidatasRexistros(rexistros, tipo) {
  const candidatas = [];
  for (const foto of rexistros || []) {
    if (!foto) continue;
    if (tipo === 'publico') {
      candidatas.push(
        foto?.rutaMiniaturaPublica,
        foto?.rutaMiniatura_Publica,
        foto?.RutaMiniaturaPublica,
        foto?.rutaMiniatura,
        foto?.rutaR2Publica,
        foto?.rutaR2_Publica,
        foto?.RutaR2_Publica,
        foto?.rutaR2,
        foto?.RutaR2
      );
    } else {
      candidatas.push(
        foto?.rutaMiniaturaRevision,
        foto?.rutaMiniaturaPrivada,
        foto?.rutaMiniatura_Privada,
        foto?.RutaMiniaturaPrivada,
        foto?.rutaMiniatura,
        foto?.rutaR2Privada,
        foto?.rutaR2_Privada,
        foto?.RutaR2_Privada,
        foto?.rutaR2Traballo,
        foto?.rutaR2Revision,
        foto?.rutaR2,
        foto?.RutaR2
      );
    }
  }
  return [...new Set(candidatas.map(texto).filter(Boolean))];
}

async function obterPrimeiro(bucket, rutas) {
  if (!bucket) return null;
  for (const ruta of rutas) {
    const obxecto = await bucket.get(ruta);
    if (obxecto) return { obxecto, ruta };
  }
  return null;
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

async function gardarRutaRevision(env, id, ruta) {
  const actual = await lerIndice(env.R2_PRIVADO, INDEX_REVISION);
  const indice = actual.fotos.findIndex((foto) => idFoto(foto) === id);
  if (indice === -1) return;

  const fotos = [...actual.fotos];
  fotos[indice] = {
    ...fotos[indice],
    rutaR2Traballo: ruta,
    rutaR2Revision: ruta
  };
  const agora = new Date();
  await env.R2_PRIVADO.put(INDEX_REVISION, JSON.stringify({
    ...(actual.raw || {}),
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

  const ruta = `${REVISION_CACHE_PREFIX}${id}.${extensionMime(mimeType)}`;
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
  await gardarRutaRevision(env, id, ruta);

  const obxecto = await env.R2_PRIVADO.get(ruta);
  return obxecto ? { obxecto, ruta } : null;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.R2_PRIVADO || !env.R2_PUBLICO || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo de miniaturas non está configurado.' });
  }

  const url = new URL(request.url);
  const identificador = texto(url.searchParams.get('idFoto'));
  const token = texto(request.headers.get('Authorization')).replace(/^Bearer\s+/i, '').trim();
  if (!identificador || !token) return json(400, { ok: false, erro: 'Faltan datos da fotografía.' });

  const usuario = await verificarTokenFirebase(token, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await administracionCacheada(env, usuario))) {
    return json(403, { ok: false, erro: 'Administración non autorizada.' });
  }

  const [revision, catalogo, privada, publica] = await Promise.all([
    lerIndice(env.R2_PRIVADO, INDEX_REVISION),
    lerIndice(env.R2_PRIVADO, CATALOGO),
    lerIndice(env.R2_PRIVADO, INDEX_PRIVADO),
    lerIndice(env.R2_PUBLICO, INDEX_PUBLICO)
  ]);

  const rexistroRevision = localizarFoto(identificador, revision.fotos);
  const rexistros = [
    rexistroRevision,
    localizarFoto(identificador, catalogo.fotos),
    localizarFoto(identificador, privada.fotos),
    localizarFoto(identificador, publica.fotos)
  ].filter(Boolean);

  if (!rexistros.length) {
    return json(404, { ok: false, erro: 'A fotografía non figura nos índices R2.' });
  }

  const privadas = rutasCandidatasRexistros(rexistros, 'privado');
  const publicas = rutasCandidatasRexistros(rexistros, 'publico');

  let atopada = await obterPrimeiro(env.R2_PRIVADO, privadas);
  let fonte = atopada ? 'R2-PRIVADO' : '';
  if (!atopada) {
    atopada = await obterPrimeiro(env.R2_PRIVADO, publicas);
    fonte = atopada ? 'R2-PRIVADO-COPIA-PUBLICA' : '';
  }
  if (!atopada) {
    atopada = await obterPrimeiro(env.R2_PUBLICO, publicas);
    fonte = atopada ? 'R2-PUBLICO' : '';
  }
  if (!atopada) {
    atopada = await obterPrimeiro(env.R2_PUBLICO, privadas);
    fonte = atopada ? 'R2-PUBLICO-COPIA-PRIVADA' : '';
  }

  if (!atopada && rexistroRevision) {
    atopada = await recuperarDeDrive(env, usuario, identificador).catch((erro) => {
      console.warn(`Non se puido recuperar ${identificador} desde Drive:`, erro);
      return null;
    });
    fonte = atopada ? 'DRIVE→R2-PRIVADO' : '';
  }

  if (!atopada) return json(404, { ok: false, erro: 'A miniatura ou fotografía non está dispoñible.' });

  const headers = new Headers();
  atopada.obxecto.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('ETag', atopada.obxecto.httpEtag || `"${identificador}"`);
  headers.set('X-SCPP-Photo-Source', fonte);
  headers.set('X-SCPP-Photo-Path', atopada.ruta);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(atopada.obxecto.body, { status: 200, headers });
}
