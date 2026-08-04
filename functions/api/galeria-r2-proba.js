import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_PATH = 'indices/galeria-publica-v1.json';
const INDEX_MAX_AGE_MS = 5 * 60 * 1000;

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
    ...headers
  }
});

const texto = (valor = '') => String(valor ?? '').trim();
const primeira = (...valores) => valores.map(texto).find(Boolean) || '';

function versionFoto(foto = {}, idFoto = '') {
  return encodeURIComponent(primera(
    foto.dataPublicacionPublica,
    foto.Data_Publicacion_Publica,
    foto.dataRevision,
    foto.Data_Revision,
    foto.dataSubida,
    foto.DataSubida,
    idFoto,
    '1'
  ));
}

function normalizarFoto(foto = {}) {
  const idFoto = primera(foto.idFoto, foto.Id_Foto, foto.rowId, foto['Row ID']);
  const rutaOriginal = primera(
    foto.rutaR2Publica,
    foto.rutaR2_Publica,
    foto.RutaR2_Publica,
    foto.rutaR2,
    foto.RutaR2
  );
  const rutaMiniatura = primera(
    foto.rutaMiniaturaPublica,
    foto.RutaMiniaturaPublica,
    foto.miniaturaR2Publica,
    foto.MiniaturaR2Publica
  );
  const codificar = (ruta) => ruta
    ? ruta.split('/').map(encodeURIComponent).join('/')
    : '';
  const version = versionFoto(foto, idFoto);

  return {
    ...foto,
    idFoto,
    rutaR2Publica: rutaOriginal,
    rutaMiniaturaPublica: rutaMiniatura,
    urlPublica: rutaOriginal
      ? `/arquivos/publico/${codificar(rutaOriginal)}?v=${version}`
      : '',
    urlMiniaturaPublica: rutaMiniatura
      ? `/arquivos/publico/${codificar(rutaMiniatura)}?v=${version}`
      : ''
  };
}

async function lerIndice(env) {
  if (!env.R2_PUBLICO) return null;
  const obxecto = await env.R2_PUBLICO.get(INDEX_PATH);
  if (!obxecto) return null;
  const datos = await obxecto.json().catch(() => null);
  return datos?.ok && Array.isArray(datos.fotos) ? datos : null;
}

async function rexenerarIndice(env) {
  if (!env.R2_PUBLICO || !env.WEB_WRITE_TOKEN) {
    throw new Error('R2 público ou Apps Script non están configurados.');
  }

  const inicio = Date.now();
  const { resultado, usouRespaldo } = await obterJsonAppsScript(
    env,
    { token: env.WEB_WRITE_TOKEN, accion: 'listarFotosGaleria' },
    { timeoutMs: 35_000, attemptTimeoutMs: 12_000 }
  );

  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non foi posible rexenerar o índice da galería.');
  }

  const indice = {
    ok: true,
    fotos: Array.isArray(resultado.fotos)
      ? resultado.fotos.map(normalizarFoto).filter((foto) => foto.urlPublica)
      : [],
    xeradoEn: new Date().toISOString(),
    xeradoEnMs: Date.now(),
    duracionXeracionMs: Date.now() - inicio,
    orixe: usouRespaldo ? 'APPS_SCRIPT_FALLBACK' : 'APPS_SCRIPT_PRIMARY'
  };

  await env.R2_PUBLICO.put(INDEX_PATH, JSON.stringify(indice), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=300'
    }
  });

  return indice;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' }, { 'Cache-Control': 'no-store' });
  }

  const inicio = Date.now();
  let indice = await lerIndice(env);

  if (indice) {
    const idadeMs = Date.now() - Number(indice.xeradoEnMs || 0);
    const fresco = Number.isFinite(idadeMs) && idadeMs < INDEX_MAX_AGE_MS;

    if (!fresco) {
      context.waitUntil(
        rexenerarIndice(env).catch((erro) => {
          console.error('Non foi posible actualizar o índice R2 da galería:', erro);
        })
      );
    }

    return json(200, {
      ...indice,
      cache: fresco ? 'HIT' : 'STALE',
      tempoRespostaMs: Date.now() - inicio
    }, {
      'X-SCPP-Index': 'R2',
      'X-SCPP-Cache': fresco ? 'HIT' : 'STALE'
    });
  }

  try {
    indice = await rexenerarIndice(env);
    return json(200, {
      ...indice,
      cache: 'MISS',
      tempoRespostaMs: Date.now() - inicio
    }, {
      'X-SCPP-Index': 'R2-CREATED',
      'X-SCPP-Cache': 'MISS'
    });
  } catch (erro) {
    console.error('Erro na proba de galería R2:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non foi posible crear o índice de proba.',
      tempoRespostaMs: Date.now() - inicio
    }, { 'Cache-Control': 'no-store' });
  }
}
