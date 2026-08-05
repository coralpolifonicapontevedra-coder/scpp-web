const INDEX_KEY = 'indices/actualidade-v1.json';
const ORIXE = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec?recurso=publicacions';
const TTL_MS = 10 * 60 * 1000;

const json = (status, body, cache = 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-SCPP-Data-Source': body?.fonte || 'UNKNOWN'
    }
  });

const texto = (valor) => String(valor ?? '').trim();

function normalizar(publicacion) {
  return {
    id: texto(publicacion?.id || publicacion?.Id || publicacion?.ID),
    titulo: texto(publicacion?.titulo || publicacion?.Titulo),
    tipo: texto(publicacion?.tipo || publicacion?.Tipo),
    medio: texto(publicacion?.medio || publicacion?.Medio),
    data: texto(publicacion?.data || publicacion?.Data),
    destacada: publicacion?.destacada === true || ['true', 'si', 'sí', 'yes', 'y', '1'].includes(texto(publicacion?.destacada || publicacion?.Destacada).toLowerCase()),
    rutaWeb: texto(publicacion?.rutaWeb || publicacion?.RutaWeb || publicacion?.enlace || publicacion?.Enlace)
  };
}

async function lerIndice(env) {
  if (!env.R2_PUBLICO) return null;
  const obxecto = await env.R2_PUBLICO.get(INDEX_KEY);
  if (!obxecto) return null;
  const datos = await obxecto.json().catch(() => null);
  return datos && Array.isArray(datos.publicacions) ? datos : null;
}

async function gardarIndice(env, publicacions) {
  if (!env.R2_PUBLICO) return;
  const agora = new Date();
  await env.R2_PUBLICO.put(INDEX_KEY, JSON.stringify({
    ok: true,
    publicacions,
    total: publicacions.length,
    xeradoEn: agora.toISOString(),
    xeradoEnMs: agora.getTime(),
    version: 1
  }), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=0, no-cache, must-revalidate'
    }
  });
}

async function consultarOrixe() {
  const resposta = await fetch(ORIXE, {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'application/json' }
  });
  if (!resposta.ok) throw new Error(`Apps Script respondeu HTTP ${resposta.status}`);
  const datos = await resposta.json();
  if (!datos?.ok || !Array.isArray(datos.publicacions)) throw new Error('Formato de publicacións non válido');
  return datos.publicacions
    .map(normalizar)
    .filter((item) => item.titulo && item.rutaWeb)
    .sort((a, b) => b.data.localeCompare(a.data));
}

export async function onRequestGet({ env }) {
  const indice = await lerIndice(env);
  const idade = indice?.xeradoEnMs ? Date.now() - Number(indice.xeradoEnMs) : Infinity;

  if (indice && idade < TTL_MS) {
    return json(200, { ...indice, fonte: 'R2-CACHE' });
  }

  try {
    const publicacions = await consultarOrixe();
    await gardarIndice(env, publicacions);
    return json(200, {
      ok: true,
      publicacions,
      total: publicacions.length,
      xeradoEn: new Date().toISOString(),
      fonte: 'SHEET-REFRESH'
    });
  } catch (erro) {
    if (indice) {
      return json(200, {
        ...indice,
        fonte: 'R2-STALE',
        aviso: erro instanceof Error ? erro.message : 'Non se puido actualizar o índice.'
      }, 'public, max-age=60, s-maxage=120, stale-while-revalidate=3600');
    }
    return json(503, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non se puideron cargar as publicacións.',
      fonte: 'ERROR'
    }, 'no-store');
  }
}
