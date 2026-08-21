import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const CHAVE_INDICE = 'indices/asistencias-concertos.json';
const CACHE_FRESCA_MS = 10 * 60 * 1000;

const ramaProducion = (env = {}) =>
  String(env.CF_PAGES_BRANCH || '').trim() === 'main';
const MAX_INTENTOS_APPS_SCRIPT = 3;

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...extraHeaders
  }
});

const agardar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;

  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    }
  );

  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;

  return {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
}

function resultadoValido(resultado) {
  const porConcerto = resultado?.asistenciasPorConcerto;
  return Boolean(
    resultado?.ok === true &&
    porConcerto &&
    typeof porConcerto === 'object' &&
    !Array.isArray(porConcerto) &&
    Object.values(porConcerto).some((asistentes) =>
      Array.isArray(asistentes) && asistentes.length > 0
    )
  );
}

async function lerCacheR2(bucket, chave) {
  if (!bucket || typeof bucket.get !== 'function') return null;

  try {
    const obxecto = await bucket.get(chave);
    if (!obxecto) return null;

    const gardado = JSON.parse(await obxecto.text());
    if (!resultadoValido(gardado?.resultado)) return null;

    const gardadoEn = Number(gardado.gardadoEn || 0);
    if (!Number.isFinite(gardadoEn) || gardadoEn <= 0) return null;

    return {
      resultado: gardado.resultado,
      gardadoEn,
      idadeMs: Math.max(0, Date.now() - gardadoEn)
    };
  } catch (erro) {
    console.warn('Non se puido ler a caché privada de asistencias en R2:', erro);
    return null;
  }
}

async function gardarCacheR2(bucket, resultado, env) {
  if (
    !ramaProducion(env) ||
    !bucket ||
    typeof bucket.put !== 'function' ||
    !resultadoValido(resultado)
  ) return;

  await bucket.put(
    CHAVE_INDICE,
    JSON.stringify({ gardadoEn: Date.now(), resultado }),
    {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'private, no-store'
      },
      customMetadata: {
        tipo: 'indice-asistencias-concertos',
        version: '1'
      }
    }
  );
}

async function consultarAppsScriptUnhaVez(env, usuario) {
  const { resultado, usouRespaldo, intento } = await obterJsonAppsScript(
    env,
    {
      token: env.WEB_WRITE_TOKEN,
      accion: 'listarAsistenciasConcertosPortal',
      email: usuario.email,
      uidFirebase: usuario.uid,
      cacheBust: Date.now()
    },
    {
      timeoutMs: 24_000,
      attemptTimeoutMs: 24_000
    }
  );

  if (!resultado?.ok) {
    const erro = new Error(resultado?.erro || 'Non foi posible consultar as asistencias.');
    erro.status = resultado?.erro === 'Usuario non autorizado' ? 403 : 400;
    throw erro;
  }

  if (!resultadoValido(resultado)) {
    const erro = new Error('A resposta de asistencias non ten o formato esperado.');
    erro.status = 502;
    throw erro;
  }

  return { resultado, usouRespaldo, intento };
}

async function consultarAppsScript(env, usuario) {
  let ultimoErro = null;

  for (let intentoLocal = 1; intentoLocal <= MAX_INTENTOS_APPS_SCRIPT; intentoLocal += 1) {
    try {
      const resposta = await consultarAppsScriptUnhaVez(env, usuario);
      return { ...resposta, intentoLocal };
    } catch (erro) {
      ultimoErro = erro;
      console.warn(`Fallou o intento ${intentoLocal} de asistencias en Apps Script.`, erro);

      const nonRecuperable = Number(erro?.status) === 400 || Number(erro?.status) === 403;
      if (nonRecuperable || intentoLocal === MAX_INTENTOS_APPS_SCRIPT) break;

      await agardar(500 * intentoLocal);
    }
  }

  throw ultimoErro || new Error('Non foi posible consultar as asistencias.');
}

function respostaAsistencias(resultado, extraHeaders = {}) {
  const porConcerto = resultado.asistenciasPorConcerto || {};
  return json(200, resultado, {
    'X-SCPP-Concertos-Con-Asistencias': String(Object.keys(porConcerto).length),
    ...extraHeaders
  });
}

async function actualizarCacheEnSegundoPlano(env, usuario) {
  try {
    const { resultado } = await consultarAppsScript(env, usuario);
    await gardarCacheR2(env.R2_PRIVADO, resultado, env);
  } catch (erro) {
    console.warn('Non se puido actualizar en segundo plano a caché de asistencias:', erro);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try {
    usuario = await verificarTokenFirebase(datos.idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase para asistencias:', erro);
  }

  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const cache = await lerCacheR2(env.R2_PRIVADO, CHAVE_INDICE);

  if (cache && cache.idadeMs <= CACHE_FRESCA_MS) {
    return respostaAsistencias(cache.resultado, {
      'X-SCPP-Asistencias-Source': 'R2-FRESH',
      'X-SCPP-Asistencias-Age': String(Math.round(cache.idadeMs / 1000)),
      'X-SCPP-AppScript': 'R2-CACHE'
    });
  }

  if (cache) {
    if (ramaProducion(env) && typeof context.waitUntil === 'function') {
      context.waitUntil(actualizarCacheEnSegundoPlano(env, usuario));
    }

    return respostaAsistencias(cache.resultado, {
      'X-SCPP-Asistencias-Source': 'R2-STALE',
      'X-SCPP-Asistencias-Age': String(Math.round(cache.idadeMs / 1000)),
      'X-SCPP-AppScript': 'R2-CACHE'
    });
  }

  const inicio = Date.now();

  try {
    const { resultado, usouRespaldo, intento, intentoLocal } = await consultarAppsScript(env, usuario);

    try {
      await gardarCacheR2(env.R2_PRIVADO, resultado, env);
    } catch (erroCache) {
      console.warn('As asistencias cargaron, pero non se puido gardar a caché R2:', erroCache);
    }

    return respostaAsistencias(resultado, {
      'X-SCPP-Asistencias-Source': 'APPS-SCRIPT',
      'X-SCPP-Asistencias-Time': String(Date.now() - inicio),
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
      'X-SCPP-AppScript-Attempt': String(intento),
      'X-SCPP-Asistencias-Retry': String(intentoLocal)
    });
  } catch (erro) {
    console.error('Erro no servizo directo de asistencias:', erro);

    if (cache) {
      return respostaAsistencias(cache.resultado, {
        'X-SCPP-Asistencias-Source': 'R2-EMERGENCY',
        'X-SCPP-Asistencias-Age': String(Math.round(cache.idadeMs / 1000)),
        'X-SCPP-AppScript': 'R2-CACHE'
      });
    }

    const status = Number(erro?.status) || (
      erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT'
        ? 504
        : 503
    );

    const url = new URL(request.url);
    const modoDiagnostico = url.searchParams.has('proba');

    return json(status, {
      ok: false,
      erro: status === 504
        ? 'O servizo de asistencias tardou demasiado en responder.'
        : 'O servizo de asistencias non está dispoñible neste momento.',
      ...(modoDiagnostico ? {
        diagnostico: {
          codigo: erro instanceof AppsScriptError ? erro.code : 'ERRO_INTERNO',
          estado: Number(erro?.status || erro?.statusCode || 0),
          tempoMs: Date.now() - inicio,
          mensaxe: erro instanceof Error ? erro.message : String(erro)
        }
      } : {})
    });
  }
}
