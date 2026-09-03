import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_TOKEN_MS = 5 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8 * 1000;
const TIMEOUT_APPS_SCRIPT_MS = 18 * 1000;
const CACHE_ACEPTACION_MS = 10 * 60 * 1000;
const CACHE_ACEPTACION_EMERXENCIA_MS = 30 * 60 * 1000;
const CACHE_ACEPTACION_PREFIX = 'cache/aceptacion-portal-v1/';
const CACHE_TEXTO_LEGAL_MS = 60 * 60 * 1000;
const CACHE_TEXTO_LEGAL_EMERXENCIA_MS = 2 * 60 * 60 * 1000;
const CACHE_TEXTO_LEGAL_KEY = 'cache/texto-legal-vixente-v1.json';

const cacheTokens = new Map();

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

async function claveCacheAceptacion(email) {
  const datos = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return CACHE_ACEPTACION_PREFIX + Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('') + '.json';
}

function textoLegalCompleto(textoLegal) {
  return Boolean(
    String(textoLegal?.version || '').trim() &&
    String(textoLegal?.titulo || '').trim() &&
    String(textoLegal?.texto || '').trim()
  );
}

function idadeMs(valor) {
  const data = Date.parse(String(valor || ''));
  return Number.isFinite(data) ? Date.now() - data : Number.POSITIVE_INFINITY;
}

async function lerCacheAceptacion(env, email, maxAgeMs = CACHE_ACEPTACION_MS) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  try {
    const obxecto = await env.R2_PRIVADO.get(await claveCacheAceptacion(email));
    if (!obxecto) return null;
    const cache = await obxecto.json();
    const idade = idadeMs(cache?.gardadaEn);
    if (!Number.isFinite(idade) || idade < 0 || idade > maxAgeMs) return null;
    if (typeof cache?.aceptacionVixente !== 'boolean') return null;
    if (cache.aceptacionVixente === false && !textoLegalCompleto(cache.textoLegal)) return null;
    return {
      aceptacionVixente: cache.aceptacionVixente,
      textoLegal: cache.textoLegal || null,
      gardadaEn: String(cache.gardadaEn || ''),
      idadeMs: idade
    };
  } catch (erro) {
    console.warn('Non se puido ler a caché de aceptación:', erro);
    return null;
  }
}

async function gardarCacheAceptacion(env, email, resultado) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return;
  try {
    await env.R2_PRIVADO.put(
      await claveCacheAceptacion(email),
      JSON.stringify({
        gardadaEn: new Date().toISOString(),
        aceptacionVixente: resultado.aceptacionVixente === true,
        textoLegal: resultado.textoLegal || null
      }),
      {
        httpMetadata: {
          contentType: 'application/json; charset=utf-8',
          cacheControl: 'private, max-age=600'
        }
      }
    );
  } catch (erro) {
    console.warn('Non se puido gardar a caché de aceptación:', erro);
  }
}

async function lerCacheTextoLegal(env, maxAgeMs = CACHE_TEXTO_LEGAL_MS) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  try {
    const obxecto = await env.R2_PRIVADO.get(CACHE_TEXTO_LEGAL_KEY);
    if (!obxecto) return null;
    const cache = await obxecto.json();
    const idade = idadeMs(cache?.gardadaEn);
    if (!Number.isFinite(idade) || idade < 0 || idade > maxAgeMs) return null;
    if (!textoLegalCompleto(cache?.textoLegal)) return null;
    return {
      textoLegal: cache.textoLegal,
      gardadaEn: String(cache.gardadaEn || ''),
      idadeMs: idade
    };
  } catch (erro) {
    console.warn('Non se puido ler a caché do texto legal:', erro);
    return null;
  }
}

async function gardarCacheTextoLegal(env, textoLegal) {
  if (!textoLegalCompleto(textoLegal)) return;
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return;
  try {
    await env.R2_PRIVADO.put(
      CACHE_TEXTO_LEGAL_KEY,
      JSON.stringify({
        gardadaEn: new Date().toISOString(),
        textoLegal
      }),
      {
        httpMetadata: {
          contentType: 'application/json; charset=utf-8',
          cacheControl: 'private, max-age=3600'
        },
        customMetadata: {
          tipo: 'texto-legal-vixente',
          version: String(textoLegal.version || '')
        }
      }
    );
  } catch (erro) {
    console.warn('Non se puido gardar a caché do texto legal:', erro);
  }
}

function prepararEnSegundoPlano(context, promesa) {
  const segura = Promise.resolve(promesa).catch((erro) => {
    console.warn('Non se puido completar a actualización de caché en segundo plano:', erro);
  });
  if (typeof context.waitUntil === 'function') context.waitUntil(segura);
  else segura.catch(() => {});
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
  while (cacheTokens.size > 100) cacheTokens.delete(cacheTokens.keys().next().value);
  return resultado;
}

function respostaCache(status, body, fonte, nivel = 'fresh') {
  return json(status, body, {
    'X-SCPP-AppScript': fonte,
    'X-SCPP-Legal-Cache': nivel,
    'Server-Timing': 'apps-script;dur=0'
  });
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

  if (accion === 'obterTextoLegalVixente') {
    const textoGlobal = await lerCacheTextoLegal(env);
    if (textoGlobal) {
      return respostaCache(200, {
        ok: true,
        email: usuarioFirebase.email,
        textoLegal: textoGlobal.textoLegal
      }, 'R2-TEXTO-LEGAL');
    }

    const aceptacionRecente = await lerCacheAceptacion(env, usuarioFirebase.email);
    if (textoLegalCompleto(aceptacionRecente?.textoLegal)) {
      prepararEnSegundoPlano(context, gardarCacheTextoLegal(env, aceptacionRecente.textoLegal));
      return respostaCache(200, {
        ok: true,
        email: usuarioFirebase.email,
        textoLegal: aceptacionRecente.textoLegal
      }, 'R2-ACEPTACION');
    }
  }

  if (accion === 'comprobarAceptacion') {
    const cache = await lerCacheAceptacion(env, usuarioFirebase.email);
    if (cache) {
      if (textoLegalCompleto(cache.textoLegal)) {
        prepararEnSegundoPlano(context, gardarCacheTextoLegal(env, cache.textoLegal));
      }
      return respostaCache(200, {
        ok: true,
        email: usuarioFirebase.email,
        aceptacionVixente: cache.aceptacionVixente,
        textoLegal: cache.textoLegal
      }, 'R2-CACHE');
    }
  }

  const corpoAppsScript = {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: usuarioFirebase.email,
    uidFirebase: usuarioFirebase.uid
  };

  if (accion === 'rexistrarAceptacion') {
    corpoAppsScript.aceptaFines = true;
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

    if (accion === 'obterTextoLegalVixente') {
      if (!textoLegalCompleto(resultado.textoLegal)) {
        return json(502, {
          ok: false,
          erro: 'O servizo devolveu un texto legal incompleto.'
        });
      }
      await gardarCacheTextoLegal(env, resultado.textoLegal);
      return json(200, {
        ok: true,
        email: usuarioFirebase.email,
        textoLegal: resultado.textoLegal
      }, {
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
        'X-SCPP-AppScript-Attempt': String(intento),
        'X-SCPP-Legal-Cache': 'refreshed',
        'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
      });
    }

    if (accion === 'comprobarAceptacion') {
      const respostaAceptacion = {
        aceptacionVixente: resultado.aceptacionVixente === true,
        textoLegal: resultado.textoLegal
      };
      await Promise.all([
        gardarCacheAceptacion(env, usuarioFirebase.email, respostaAceptacion),
        gardarCacheTextoLegal(env, resultado.textoLegal)
      ]);
      return json(200, {
        ok: true,
        email: usuarioFirebase.email,
        ...respostaAceptacion
      }, {
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
        'X-SCPP-AppScript-Attempt': String(intento),
        'X-SCPP-Legal-Cache': 'refreshed',
        'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
      });
    }

    const [cacheAnterior, textoGlobal] = await Promise.all([
      lerCacheAceptacion(env, usuarioFirebase.email, CACHE_ACEPTACION_EMERXENCIA_MS),
      lerCacheTextoLegal(env, CACHE_TEXTO_LEGAL_EMERXENCIA_MS)
    ]);
    const textoLegal = textoGlobal?.textoLegal || cacheAnterior?.textoLegal || {
      version: resultado.version || ''
    };
    await gardarCacheAceptacion(env, usuarioFirebase.email, {
      aceptacionVixente: true,
      textoLegal
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
      'X-SCPP-Legal-Cache': 'updated',
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error('Erro no servizo de aceptación:', erro);

    if (accion === 'obterTextoLegalVixente') {
      const textoEmerxencia = await lerCacheTextoLegal(env, CACHE_TEXTO_LEGAL_EMERXENCIA_MS);
      if (textoEmerxencia) {
        return respostaCache(200, {
          ok: true,
          email: usuarioFirebase.email,
          textoLegal: textoEmerxencia.textoLegal,
          recuperado: true
        }, 'R2-STALE-TEXTO', 'stale-if-error');
      }
    }

    if (accion === 'comprobarAceptacion') {
      const aceptacionEmerxencia = await lerCacheAceptacion(
        env,
        usuarioFirebase.email,
        CACHE_ACEPTACION_EMERXENCIA_MS
      );
      if (aceptacionEmerxencia) {
        return respostaCache(200, {
          ok: true,
          email: usuarioFirebase.email,
          aceptacionVixente: aceptacionEmerxencia.aceptacionVixente,
          textoLegal: aceptacionEmerxencia.textoLegal,
          recuperado: true
        }, 'R2-STALE-ACEPTACION', 'stale-if-error');
      }
    }

    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: 'O servizo de acceso non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
