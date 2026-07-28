const CACHE_REPERTORIO_MS = 5 * 60 * 1000;
const CACHE_ASISTENCIAS_MS = 2 * 60 * 1000;
const CACHE_TOKEN_MS = 5 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8 * 1000;
const TIMEOUT_APPS_SCRIPT_MS = 18 * 1000;

const cacheRespostas = new Map();
const cacheTokens = new Map();

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

function limparCache(cache, maximo = 100) {
  const agora = Date.now();
  for (const [clave, entrada] of cache.entries()) {
    if (!entrada || entrada.expira <= agora) cache.delete(clave);
  }
  while (cache.size > maximo) cache.delete(cache.keys().next().value);
}

function lerCache(cache, clave) {
  const entrada = cache.get(clave);
  if (!entrada) return null;
  if (entrada.expira <= Date.now()) {
    cache.delete(clave);
    return null;
  }
  return entrada.valor;
}

function gardarCache(cache, clave, valor, duracionMs) {
  cache.set(clave, { valor, expira: Date.now() + duracionMs });
  limparCache(cache);
}

async function fetchConTempoLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;

  const usuarioCacheado = lerCache(cacheTokens, token);
  if (usuarioCacheado) return usuarioCacheado;

  const resposta = await fetchConTempoLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    TIMEOUT_FIREBASE_MS
  );
  if (!resposta.ok) return null;

  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;

  const resultado = {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
  gardarCache(cacheTokens, token, resultado, CACHE_TOKEN_MS);
  return resultado;
}

function respostaFicheiro(resultado) {
  const binario = atob(String(resultado.base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const nome = String(resultado.nomeFicheiro || 'ficheiro').replace(/[\r\n"]/g, '');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': String(resultado.mimeType || 'application/octet-stream'),
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.APPS_SCRIPT_WEBAPP_URL || !env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'Falta a configuración segura do servizo' });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try {
    usuario = await verificarTokenFirebase(
      String(datos.idToken || '').trim(),
      env.FIREBASE_API_KEY
    );
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const accion = String(datos.accion || 'listarRepertorioPortal').trim();
  if (![
    'listarRepertorioPortal',
    'listarAsistenciasConcertosPortal',
    'obterFicheiroRepertorio'
  ].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  const duracionCache = accion === 'listarRepertorioPortal'
    ? CACHE_REPERTORIO_MS
    : accion === 'listarAsistenciasConcertosPortal'
      ? CACHE_ASISTENCIAS_MS
      : 0;

  if (duracionCache) {
    const resultadoCacheado = lerCache(cacheRespostas, accion);
    if (resultadoCacheado) {
      return json(200, resultadoCacheado, {
        'X-SCPP-Cache': 'HIT',
        'Server-Timing': 'apps-script;dur=0'
      });
    }
  }

  const inicio = Date.now();
  try {
    const resposta = await fetchConTempoLimite(
      env.APPS_SCRIPT_WEBAPP_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          token: env.WEB_WRITE_TOKEN,
          accion,
          email: usuario.email,
          uidFirebase: usuario.uid,
          ruta: String(datos.ruta || '').trim()
        })
      },
      TIMEOUT_APPS_SCRIPT_MS
    );

    if (!resposta.ok) {
      return json(502, { ok: false, erro: 'O servizo de repertorio respondeu cun erro' });
    }

    const texto = await resposta.text();
    let resultado;
    try {
      resultado = JSON.parse(texto);
    } catch {
      return json(502, { ok: false, erro: 'O servizo devolveu unha resposta non válida' });
    }
    if (!resultado.ok) {
      return json(resultado.erro === 'Usuario non autorizado' ? 403 : 400, resultado);
    }
    if (accion === 'obterFicheiroRepertorio') return respostaFicheiro(resultado);

    if (duracionCache) gardarCache(cacheRespostas, accion, resultado, duracionCache);

    return json(200, resultado, {
      'X-SCPP-Cache': 'MISS',
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error(erro);
    if (erro instanceof Error && erro.name === 'AbortError') {
      return json(504, {
        ok: false,
        erro: 'O servizo de repertorio tardou demasiado en responder. Tenta de novo nuns segundos.'
      });
    }
    return json(502, { ok: false, erro: 'Non foi posible contactar co servizo de repertorio' });
  }
}
