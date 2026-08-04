import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_FRESH_MS = 5 * 60 * 1000;
const CACHE_BROWSER_SECONDS = 60;
const CACHE_EDGE_SECONDS = 24 * 60 * 60;
const CACHE_KEY_PATH = '/__scpp-cache/galeria-publica-v1';

const json = (status, body, cacheControl = 'no-store', extraHeaders = {}) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      ...extraHeaders
    }
  }
);

function primeiraRuta(...valores) {
  return valores
    .map((valor) => String(valor || '').trim())
    .find(Boolean) || '';
}

function versionFoto(foto = {}, idFoto = '') {
  const valor = primeiraRuta(
    foto.dataPublicacionPublica,
    foto.Data_Publicacion_Publica,
    foto.dataRevision,
    foto.Data_Revision,
    foto.dataSubida,
    foto.DataSubida,
    idFoto
  );

  return encodeURIComponent(valor || idFoto || '1');
}

function normalizarFoto(foto = {}) {
  const idFoto = primeiraRuta(
    foto.idFoto,
    foto.Id_Foto,
    foto.rowId,
    foto['Row ID']
  );

  const rutaR2 = primeiraRuta(
    foto.rutaR2Publica,
    foto.rutaR2_Publica,
    foto.RutaR2_Publica,
    foto.rutaR2,
    foto.RutaR2
  );

  const rutaCodificada = rutaR2
    ? rutaR2.split('/').map(encodeURIComponent).join('/')
    : '';

  return {
    ...foto,
    idFoto,
    rutaR2Publica: rutaR2,
    urlPublica: rutaCodificada
      ? `/arquivos/publico/${rutaCodificada}?v=${versionFoto(foto, idFoto)}`
      : ''
  };
}

function cacheKey(request) {
  const url = new URL(request.url);
  url.pathname = CACHE_KEY_PATH;
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
}

function respostaGaleria(body, estadoCache, xeradaEn = Date.now()) {
  return json(
    200,
    body,
    `public, max-age=${CACHE_BROWSER_SECONDS}, s-maxage=${CACHE_EDGE_SECONDS}, stale-while-revalidate=${CACHE_EDGE_SECONDS}`,
    {
      'X-SCPP-Cache': estadoCache,
      'X-SCPP-Generated-At': String(xeradaEn)
    }
  );
}

async function consultarGaleria(env) {
  const { resultado, usouRespaldo } = await obterJsonAppsScript(
    env,
    {
      token: env.WEB_WRITE_TOKEN,
      accion: 'listarFotosGaleria'
    },
    {
      timeoutMs: 75_000,
      attemptTimeoutMs: 30_000
    }
  );

  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non foi posible cargar a galería.');
  }

  const fotos = Array.isArray(resultado.fotos)
    ? resultado.fotos.map(normalizarFoto)
    : [];

  return {
    body: { ...resultado, fotos },
    usouRespaldo
  };
}

async function actualizarCache(cache, key, env) {
  const { body, usouRespaldo } = await consultarGaleria(env);
  const xeradaEn = Date.now();
  const resposta = respostaGaleria(body, 'MISS', xeradaEn);
  const paraCache = new Response(resposta.body, resposta);
  paraCache.headers.set('X-SCPP-AppScript', usouRespaldo ? 'FALLBACK' : 'PRIMARY');
  paraCache.headers.set('X-SCPP-Generated-At', String(xeradaEn));
  await cache.put(key, paraCache.clone());
  return paraCache;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.WEB_WRITE_TOKEN) {
    return json(500, {
      ok: false,
      erro: 'O servizo da galería non está configurado correctamente.'
    });
  }

  const cache = caches.default;
  const key = cacheKey(request);
  const gardada = await cache.match(key);

  if (gardada) {
    const xeradaEn = Number(gardada.headers.get('X-SCPP-Generated-At') || 0);
    const fresca = xeradaEn > 0 && Date.now() - xeradaEn < CACHE_FRESH_MS;
    const resposta = new Response(gardada.body, gardada);
    resposta.headers.set('X-SCPP-Cache', fresca ? 'HIT' : 'STALE');
    resposta.headers.set(
      'Cache-Control',
      `public, max-age=${CACHE_BROWSER_SECONDS}, s-maxage=${CACHE_EDGE_SECONDS}, stale-while-revalidate=${CACHE_EDGE_SECONDS}`
    );

    if (!fresca) {
      context.waitUntil(
        actualizarCache(cache, key, env).catch((erro) => {
          console.error('Non foi posible actualizar a caché da galería:', erro);
        })
      );
    }

    return resposta;
  }

  try {
    return await actualizarCache(cache, key, env);
  } catch (erro) {
    console.error('Erro ao cargar a galería pública:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT'
      ? 504
      : 503;

    return json(status, {
      ok: false,
      erro: 'A galería dinámica non está dispoñible neste momento.'
    });
  }
}
