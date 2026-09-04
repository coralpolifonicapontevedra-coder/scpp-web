import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_TOKEN_MS = 10 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8 * 1000;
const TIMEOUT_APPS_SCRIPT_MS = 18 * 1000;
const CACHE_ACEPTACION_FRESCA_MS = 60 * 60 * 1000;
const CACHE_ACEPTACION_RESPALDO_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_ACEPTACION_PREFIX = 'cache/aceptacion-portal-v2/';
const PERFIS_MAIN = 'persoas/cache/perfis.json';
const PERFIS_PREVIEW = 'persoas/cache/preview/perfis.json';

const cacheTokens = new Map();
const clean = (value) => String(value || '').trim();
const ramaActual = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const perfisKey = (env) => ramaActual(env) === 'main' ? PERFIS_MAIN : PERFIS_PREVIEW;

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
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

async function hashTexto(value) {
  const datos = new TextEncoder().encode(clean(value).toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function claveCacheAceptacion(env, email) {
  return `${CACHE_ACEPTACION_PREFIX}${ramaActual(env)}/${await hashTexto(email)}.json`;
}

function textoLegalCompleto(textoLegal) {
  return Boolean(
    clean(textoLegal?.version) &&
    clean(textoLegal?.titulo) &&
    clean(textoLegal?.texto)
  );
}

async function lerCacheAceptacion(env, email) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const obxecto = await env.R2_PRIVADO.get(await claveCacheAceptacion(env, email));
    if (!obxecto) return null;
    const cache = await obxecto.json().catch(() => null);
    const gardadaEnMs = Date.parse(clean(cache?.gardadaEn));
    if (!Number.isFinite(gardadaEnMs)) return null;
    const idadeMs = Date.now() - gardadaEnMs;
    if (idadeMs < 0 || idadeMs > CACHE_ACEPTACION_RESPALDO_MS) return null;
    if (typeof cache?.aceptacionVixente !== 'boolean') return null;
    if (cache.aceptacionVixente === false && !textoLegalCompleto(cache.textoLegal)) return null;
    return {
      aceptacionVixente: cache.aceptacionVixente,
      textoLegal: cache.textoLegal || null,
      idadeMs,
      fresca: idadeMs <= CACHE_ACEPTACION_FRESCA_MS
    };
  } catch (erro) {
    console.warn('Non se puido ler a caché de aceptación:', erro);
    return null;
  }
}

async function gardarCacheAceptacion(env, email, resultado) {
  if (!env.R2_PRIVADO?.put) return;
  try {
    await env.R2_PRIVADO.put(
      await claveCacheAceptacion(env, email),
      JSON.stringify({
        gardadaEn: new Date().toISOString(),
        aceptacionVixente: resultado.aceptacionVixente === true,
        textoLegal: resultado.textoLegal || null
      }),
      {
        httpMetadata: {
          contentType: 'application/json; charset=utf-8',
          cacheControl: 'private, no-store'
        },
        customMetadata: { tipo: 'aceptacion-portal', version: '2', contorno: ramaActual(env) }
      }
    );
  } catch (erro) {
    console.warn('Non se puido gardar a caché de aceptación:', erro);
  }
}

function correoPersoa(persoa) {
  return clean(persoa?.correoElectronico || persoa?.correo || persoa?.email).toLowerCase();
}

async function estadoPersoaR2(env, email) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(perfisKey(env));
    if (!object) return null;
    const indice = await object.json().catch(() => null);
    const persoa = Array.isArray(indice?.persoas)
      ? indice.persoas.find((item) => correoPersoa(item) === clean(email).toLowerCase())
      : null;
    if (!persoa) return null;
    return persoa?.activo === false ? false : true;
  } catch (error) {
    console.warn('Non se puido comprobar o estado da persoa en R2:', error);
    return null;
  }
}

async function verificarTokenFirebase(idToken, apiKey) {
  const token = clean(idToken);
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
    uid: clean(usuario.localId),
    email: clean(usuario.email).toLowerCase()
  };
  cacheTokens.set(token, { usuario: resultado, expira: Date.now() + CACHE_TOKEN_MS });
  while (cacheTokens.size > 100) cacheTokens.delete(cacheTokens.keys().next().value);
  return resultado;
}

function corpoAppsScript(env, usuario, accion, extra = {}) {
  return {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: usuario.email,
    uidFirebase: usuario.uid,
    ...extra
  };
}

async function consultarAppsScript(env, usuario, accion, extra = {}) {
  return obterJsonAppsScript(
    env,
    corpoAppsScript(env, usuario, accion, extra),
    { timeoutMs: TIMEOUT_APPS_SCRIPT_MS }
  );
}

async function refrescarAceptacion(context, usuario) {
  try {
    const { resultado } = await consultarAppsScript(context.env, usuario, 'comprobarAceptacion');
    if (!resultado?.ok) return;
    await gardarCacheAceptacion(context.env, usuario.email, {
      aceptacionVixente: resultado.aceptacionVixente === true,
      textoLegal: resultado.textoLegal || null
    });
  } catch (error) {
    console.warn('Non se puido refrescar a aceptación en segundo plano:', error);
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

  const idToken = clean(datos.idToken);
  const accion = clean(datos.accion || 'rexistrarAceptacion');

  if (!idToken) return json(401, { ok: false, erro: 'É necesario identificarse de novo' });
  if (!['obterTextoLegalVixente', 'comprobarAceptacion', 'rexistrarAceptacion'].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non válida' });
  }
  if (accion === 'rexistrarAceptacion' && datos.aceptaFines !== true) {
    return json(400, { ok: false, erro: 'É necesario confirmar a aceptación' });
  }

  let usuarioFirebase;
  try {
    usuarioFirebase = await verificarTokenFirebase(idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuarioFirebase) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  if (accion === 'comprobarAceptacion') {
    const estadoPersoa = await estadoPersoaR2(env, usuarioFirebase.email);
    if (estadoPersoa === false) {
      return json(403, { ok: false, erro: 'A túa conta xa non está activa no Portal.' }, {
        'X-SCPP-Access-Source': 'R2-PERSOAS'
      });
    }

    const cache = await lerCacheAceptacion(env, usuarioFirebase.email);
    if (cache) {
      if (!cache.fresca) {
        const tarefa = refrescarAceptacion(context, usuarioFirebase);
        if (typeof context.waitUntil === 'function') context.waitUntil(tarefa);
      }
      return json(200, {
        ok: true,
        email: usuarioFirebase.email,
        aceptacionVixente: cache.aceptacionVixente,
        textoLegal: cache.textoLegal
      }, {
        'X-SCPP-AppScript': cache.fresca ? 'R2-CACHE' : 'R2-STALE-WHILE-REVALIDATE',
        'X-SCPP-Data-Age': String(Math.max(0, Math.floor(cache.idadeMs / 1000))),
        'Server-Timing': 'apps-script;dur=0'
      });
    }
  }

  const inicio = Date.now();
  try {
    const extra = accion === 'rexistrarAceptacion' ? { aceptaFines: true } : {};
    const { resultado, usouRespaldo, intento } = await consultarAppsScript(env, usuarioFirebase, accion, extra);

    if (!resultado?.ok) {
      return json(resultado?.erro === 'Usuario non autorizado' ? 403 : 400, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible completar a aceptación.'
      });
    }

    if (accion === 'obterTextoLegalVixente') {
      return json(200, {
        ok: true,
        email: usuarioFirebase.email,
        textoLegal: resultado.textoLegal
      }, {
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
        'X-SCPP-AppScript-Attempt': String(intento),
        'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
      });
    }

    if (accion === 'comprobarAceptacion') {
      const respostaAceptacion = {
        aceptacionVixente: resultado.aceptacionVixente === true,
        textoLegal: resultado.textoLegal || null
      };
      await gardarCacheAceptacion(env, usuarioFirebase.email, respostaAceptacion);
      return json(200, {
        ok: true,
        email: usuarioFirebase.email,
        ...respostaAceptacion
      }, {
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
        'X-SCPP-AppScript-Attempt': String(intento),
        'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
      });
    }

    const cacheAnterior = await lerCacheAceptacion(env, usuarioFirebase.email);
    await gardarCacheAceptacion(env, usuarioFirebase.email, {
      aceptacionVixente: true,
      textoLegal: cacheAnterior?.textoLegal || { version: resultado.version || '' }
    });

    return json(200, {
      ok: true,
      email: usuarioFirebase.email,
      mensaxe: 'Aceptación rexistrada correctamente',
      version: resultado.version || '',
      redirect: resultado.redirect || ''
    }, {
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
      'X-SCPP-AppScript-Attempt': String(intento),
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error('Erro no servizo de aceptación:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: 'O servizo de acceso non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
