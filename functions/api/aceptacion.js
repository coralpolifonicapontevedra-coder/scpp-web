const CACHE_TOKEN_MS = 5 * 60 * 1000;
const CACHE_ACEPTACION_MS = 15 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8 * 1000;
const TIMEOUT_APPS_SCRIPT_MS = 15 * 1000;

const cacheTokens = new Map();
const cacheAceptacions = new Map();

const json = (status, body, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
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

  const idToken = String(datos.idToken || '').trim();
  const accion = String(datos.accion || 'rexistrarAceptacion').trim();
  const textoLegal = String(datos.textoLegal || '').trim();
  const version = String(datos.version || '').trim();

  if (!idToken) {
    return json(401, { ok: false, erro: 'É necesario identificarse de novo' });
  }
  if (accion !== 'comprobarAceptacion' && accion !== 'rexistrarAceptacion') {
    return json(400, { ok: false, erro: 'Acción non válida' });
  }
  if (!version) {
    return json(400, { ok: false, erro: 'Falta a versión do texto legal' });
  }
  if (accion === 'rexistrarAceptacion') {
    if (datos.aceptaFines !== true) {
      return json(400, { ok: false, erro: 'É necesario confirmar a aceptación' });
    }
    if (!textoLegal) {
      return json(400, { ok: false, erro: 'Falta o texto legal' });
    }
  }

  let usuarioFirebase;
  try {
    usuarioFirebase = await verificarTokenFirebase(idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuarioFirebase) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const claveAceptacion = `${usuarioFirebase.email}|${version}`;
  if (accion === 'comprobarAceptacion' && lerCache(cacheAceptacions, claveAceptacion) === true) {
    return json(200, {
      ok: true,
      email: usuarioFirebase.email,
      aceptacionVixente: true
    }, { 'X-SCPP-Cache': 'HIT' });
  }

  const inicio = Date.now();
  try {
    const corpoAppsScript = {
      token: env.WEB_WRITE_TOKEN,
      accion,
      email: usuarioFirebase.email,
      uidFirebase: usuarioFirebase.uid,
      version
    };

    if (accion === 'rexistrarAceptacion') {
      corpoAppsScript.textoLegal = textoLegal;
      corpoAppsScript.aceptaFines = true;
      corpoAppsScript.ambito = String(
        datos.ambito || 'coralpolifonicapontevedra.org'
      ).trim();
    }

    const respostaAppsScript = await fetchConTempoLimite(
      env.APPS_SCRIPT_WEBAPP_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(corpoAppsScript)
      },
      TIMEOUT_APPS_SCRIPT_MS
    );

    if (!respostaAppsScript.ok) {
      return json(502, { ok: false, erro: 'O servizo de aceptación respondeu cun erro' });
    }

    const textoResposta = await respostaAppsScript.text();
    let resultado;
    try {
      resultado = JSON.parse(textoResposta);
    } catch {
      return json(502, { ok: false, erro: 'O servizo devolveu unha resposta non válida' });
    }

    if (!resultado.ok) {
      return json(resultado.erro === 'Usuario non autorizado' ? 403 : 400, resultado);
    }

    if (accion === 'comprobarAceptacion') {
      const aceptacionVixente = resultado.aceptacionVixente === true;
      if (aceptacionVixente) {
        gardarCache(cacheAceptacions, claveAceptacion, true, CACHE_ACEPTACION_MS);
      }
      return json(200, {
        ok: true,
        email: usuarioFirebase.email,
        aceptacionVixente
      }, {
        'X-SCPP-Cache': 'MISS',
        'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
      });
    }

    gardarCache(cacheAceptacions, claveAceptacion, true, CACHE_ACEPTACION_MS);
    return json(200, {
      ok: true,
      email: usuarioFirebase.email,
      mensaxe: 'Aceptación rexistrada correctamente',
      redirect: resultado.redirect || ''
    }, {
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error(erro);
    if (erro instanceof Error && erro.name === 'AbortError') {
      return json(504, {
        ok: false,
        erro: 'O servizo tardou demasiado en responder. Tenta de novo nuns segundos.'
      });
    }
    return json(502, { ok: false, erro: 'Non foi posible contactar co servizo de aceptación' });
  }
}
