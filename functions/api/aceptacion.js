import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_TOKEN_MS = 5 * 60 * 1000;
const CACHE_ACEPTACION_MS = 30 * 60 * 1000;
const CACHE_ACEPTACION_RESPALDO_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8 * 1000;
const TIMEOUT_APPS_SCRIPT_MS = 18 * 1000;

const cacheTokens = new Map();
const cacheAceptacions = new Map();

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

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

  const cacheado = cacheTokens.get(token);
  if (cacheado && cacheado.expira > Date.now()) return cacheado.usuario;

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
  cacheTokens.set(token, { usuario: resultado, expira: Date.now() + CACHE_TOKEN_MS });
  return resultado;
}

function cacheRequest(request, clave) {
  const url = new URL(request.url);
  url.pathname = '/api/_cache/aceptacion';
  url.search = `clave=${encodeURIComponent(clave)}`;
  return new Request(url.toString(), { method: 'GET' });
}

async function lerAceptacionCache(request, clave) {
  const memoria = cacheAceptacions.get(clave);
  if (memoria && Date.now() - memoria.savedAt <= CACHE_ACEPTACION_RESPALDO_MS) return memoria;

  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return null;
  try {
    const resposta = await cacheApi.match(cacheRequest(request, clave));
    if (!resposta) return null;
    const entrada = await resposta.json();
    if (entrada?.aceptacionVixente !== true) return null;
    if (Date.now() - Number(entrada.savedAt || 0) > CACHE_ACEPTACION_RESPALDO_MS) return null;
    cacheAceptacions.set(clave, entrada);
    return entrada;
  } catch {
    return null;
  }
}

async function gardarAceptacionCache(request, clave) {
  const entrada = { aceptacionVixente: true, savedAt: Date.now() };
  cacheAceptacions.set(clave, entrada);

  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return;
  try {
    await cacheApi.put(cacheRequest(request, clave), new Response(JSON.stringify(entrada), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${Math.floor(CACHE_ACEPTACION_RESPALDO_MS / 1000)}`
      }
    }));
  } catch (erro) {
    console.warn('Non se puido gardar a caché de aceptación:', erro);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
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

  if (!idToken) return json(401, { ok: false, erro: 'É necesario identificarse de novo' });
  if (!['comprobarAceptacion', 'rexistrarAceptacion'].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non válida' });
  }
  if (!version) return json(400, { ok: false, erro: 'Falta a versión do texto legal' });
  if (accion === 'rexistrarAceptacion' && (datos.aceptaFines !== true || !textoLegal)) {
    return json(400, { ok: false, erro: 'É necesario confirmar a aceptación e o texto legal' });
  }

  let usuarioFirebase;
  try {
    usuarioFirebase = await verificarTokenFirebase(idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuarioFirebase) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const claveAceptacion = `${usuarioFirebase.email}|${version}`;
  const cacheada = await lerAceptacionCache(request, claveAceptacion);
  if (accion === 'comprobarAceptacion' && cacheada?.aceptacionVixente === true) {
    const idade = Date.now() - cacheada.savedAt;
    return json(200, {
      ok: true,
      email: usuarioFirebase.email,
      aceptacionVixente: true
    }, {
      'X-SCPP-Cache': idade <= CACHE_ACEPTACION_MS ? 'HIT' : 'EMERGENCY'
    });
  }

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
    corpoAppsScript.ambito = String(datos.ambito || 'coralpolifonicapontevedra.org').trim();
  }

  const inicio = Date.now();
  try {
    const { resultado, usouRespaldo, intento } = await obterJsonAppsScript(
      env,
      corpoAppsScript,
      { timeoutMs: TIMEOUT_APPS_SCRIPT_MS }
    );

    if (!resultado?.ok) {
      return json(resultado?.erro === 'Usuario non autorizado' ? 403 : 400, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible completar a aceptación.'
      });
    }

    if (accion === 'comprobarAceptacion') {
      const aceptacionVixente = resultado.aceptacionVixente === true;
      if (aceptacionVixente) await gardarAceptacionCache(request, claveAceptacion);
      return json(200, {
        ok: true,
        email: usuarioFirebase.email,
        aceptacionVixente
      }, {
        'X-SCPP-Cache': 'MISS',
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
        'X-SCPP-AppScript-Attempt': String(intento),
        'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
      });
    }

    await gardarAceptacionCache(request, claveAceptacion);
    return json(200, {
      ok: true,
      email: usuarioFirebase.email,
      mensaxe: 'Aceptación rexistrada correctamente',
      redirect: resultado.redirect || ''
    }, {
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
      'X-SCPP-AppScript-Attempt': String(intento),
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error('Erro no servizo de aceptación:', erro);

    const anterior = await lerAceptacionCache(request, claveAceptacion);
    if (accion === 'comprobarAceptacion' && anterior?.aceptacionVixente === true) {
      return json(200, {
        ok: true,
        email: usuarioFirebase.email,
        aceptacionVixente: true
      }, {
        'X-SCPP-Cache': 'EMERGENCY',
        'X-SCPP-Warning': 'upstream-unavailable'
      });
    }

    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: 'O servizo de acceso non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
