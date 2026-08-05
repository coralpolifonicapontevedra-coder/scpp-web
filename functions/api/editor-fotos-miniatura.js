const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const CATALOGO = 'indices/catalogo-fotos.json';
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

const texto = (valor) => String(valor || '').trim();
const idFoto = (foto) => texto(
  foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID']
);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
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
  return texto(usuario.email).toLowerCase();
}

async function claveCorreo(email) {
  const datos = new TextEncoder().encode(texto(email).toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((valor) => valor.toString(16).padStart(2, '0')).join('');
}

async function administracionCacheada(env, email) {
  if (!env.R2_PRIVADO || !email) return false;
  const clave = await claveCorreo(email);
  const obxecto = await env.R2_PRIVADO.get(`cache/autorizacion-fotos/${clave}.json`);
  if (!obxecto) return false;
  const datos = await obxecto.json().catch(() => null);
  const verificadaEn = Date.parse(texto(datos?.verificadaEn));
  return datos?.administrador === true && Number.isFinite(verificadaEn) &&
    Date.now() - verificadaEn < AUTH_TTL_MS;
}

async function lerIndice(bucket, clave) {
  if (!bucket) return [];
  const obxecto = await bucket.get(clave);
  if (!obxecto) return [];
  const indice = await obxecto.json().catch(() => null);
  return Array.isArray(indice?.fotos) ? indice.fotos : [];
}

function localizarFoto(id, ...listas) {
  for (const lista of listas) {
    const foto = lista.find((item) => idFoto(item) === id);
    if (foto) return foto;
  }
  return null;
}

function rutasCandidatas(foto, tipo) {
  const candidatas = tipo === 'publico'
    ? [foto?.rutaMiniaturaPublica, foto?.rutaMiniatura, foto?.rutaR2Publica, foto?.rutaR2]
    : [foto?.rutaMiniaturaRevision, foto?.rutaMiniaturaPrivada, foto?.rutaMiniatura, foto?.rutaR2Privada, foto?.rutaR2];
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

  const email = await verificarTokenFirebase(token, env.FIREBASE_API_KEY).catch(() => null);
  if (!email) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await administracionCacheada(env, email))) {
    return json(403, { ok: false, erro: 'Administración non autorizada.' });
  }

  const [revision, catalogo, privada, publica] = await Promise.all([
    lerIndice(env.R2_PRIVADO, INDEX_REVISION),
    lerIndice(env.R2_PRIVADO, CATALOGO),
    lerIndice(env.R2_PRIVADO, INDEX_PRIVADO),
    lerIndice(env.R2_PUBLICO, INDEX_PUBLICO)
  ]);

  const fotoRevision = localizarFoto(identificador, revision);
  const fotoCatalogo = localizarFoto(identificador, catalogo);
  const fotoPrivada = localizarFoto(identificador, privada);
  const fotoPublica = localizarFoto(identificador, publica);
  const combinada = { ...fotoPublica, ...fotoPrivada, ...fotoCatalogo, ...fotoRevision, idFoto: identificador };

  let atopada = await obterPrimeiro(env.R2_PRIVADO, rutasCandidatas(combinada, 'privado'));
  let fonte = atopada ? 'R2-PRIVADO' : '';
  if (!atopada) {
    atopada = await obterPrimeiro(env.R2_PUBLICO, rutasCandidatas(combinada, 'publico'));
    fonte = atopada ? 'R2-PUBLICO' : '';
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
