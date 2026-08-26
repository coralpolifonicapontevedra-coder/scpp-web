const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const CATALOGO = 'indices/catalogo-fotos.json';
const PHOTO_AUTH_PREFIX = 'cache/autorizacion-fotos/';
const ADMIN_AUTH_PREFIX = 'persoas/cache/administracion/';
const AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_CACHE_VERSION = 2;

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
    ) {
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
  if (!bucket) return [];
  const obxecto = await bucket.get(clave);
  if (!obxecto) return [];
  const indice = await obxecto.json().catch(() => null);
  return Array.isArray(indice?.fotos) ? indice.fotos : [];
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

  const rexistros = [
    localizarFoto(identificador, revision),
    localizarFoto(identificador, catalogo),
    localizarFoto(identificador, privada),
    localizarFoto(identificador, publica)
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
  if (!atopada) return json(404, { ok: false, erro: 'A miniatura ou fotografía non está dispoñible en R2.' });

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
