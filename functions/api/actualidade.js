const INDEX_KEY = 'indices/actualidade-v1.json';
const ORIXE = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec?recurso=publicacions';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

const PRODUCION_PUBLICACIONS = [
  {
    id: 'producion-2026-08-28-prensa',
    titulo: 'A Polifónica abre o curso 2026/2027 e busca novas voces',
    tipo: 'Noticia',
    medio: 'Faro de Vigo · PontevedraViva',
    data: '2026-08-28',
    destacada: true,
    rutaWeb: '/documentos/publicacions/2026-08-28_faro-vigo-novos-talentos-gl.pdf'
  }
];

const json = (status, body, cache = 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
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

function respostaValida(datos) {
  return datos?.ok === true && Array.isArray(datos?.publicacions);
}

function engadirPublicacionProducion(datos) {
  if (!respostaValida(datos)) return datos;
  const rutasAnteriores = new Set([
    '/documentos/publicacions/2026-08-28_ficha_pontevedraviva-voces-masculinas.pdf',
    '/documentos/publicacions/2026-08-28_ficha_faro-novos-talentos.pdf',
    '/documentos/publicacions/2026-08-28_faro-vigo-novos-talentos-gl.pdf'
  ]);
  const titulosAnteriores = new Set([
    'Procúranse voces masculinas na Sociedade Coral Polifónica de Pontevedra',
    'A Coral Polifónica busca novos talentos para reforzar as súas voces',
    'A Polifónica abre o curso 2026/2027 e busca novas voces'
  ]);
  const base = datos.publicacions.filter((item) =>
    !rutasAnteriores.has(texto(item?.rutaWeb || item?.RutaWeb)) &&
    !titulosAnteriores.has(texto(item?.titulo || item?.Titulo))
  );
  const publicacions = [...PRODUCION_PUBLICACIONS, ...base]
    .map(normalizar)
    .filter((item) => item.titulo && item.rutaWeb)
    .sort((a, b) => b.data.localeCompare(a.data));

  return {
    ...datos,
    publicacions,
    total: publicacions.length
  };
}

async function lerIndice(env) {
  if (!env.R2_PUBLICO) return null;
  const obxecto = await env.R2_PUBLICO.get(INDEX_KEY);
  if (!obxecto) return null;
  const datos = await obxecto.json().catch(() => null);
  return respostaValida(datos) ? datos : null;
}

async function gardarIndice(env, datos) {
  if (!env.R2_PUBLICO) return;
  await env.R2_PUBLICO.put(INDEX_KEY, JSON.stringify(datos), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400'
    }
  });
}

async function cargarDesdeSheet() {
  const resposta = await fetch(ORIXE, {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'application/json' }
  });
  if (!resposta.ok) throw new Error(`Apps Script respondeu HTTP ${resposta.status}`);
  const datos = await resposta.json();
  if (!respostaValida(datos)) throw new Error('Formato de publicacións non válido');

  const publicacions = datos.publicacions
    .map(normalizar)
    .filter((item) => item.titulo && item.rutaWeb)
    .sort((a, b) => b.data.localeCompare(a.data));

  return {
    ok: true,
    publicacions,
    total: publicacions.length,
    xeradoEn: new Date().toISOString(),
    xeradoEnMs: Date.now(),
    fonte: 'SHEET',
    version: 2
  };
}

async function refrescar(env) {
  const actualizado = await cargarDesdeSheet();
  await gardarIndice(env, actualizado);
  return actualizado;
}

export async function onRequestGet({ env, waitUntil }) {
  const indice = await lerIndice(env).catch(() => null);
  const idade = indice ? Date.now() - Number(indice.xeradoEnMs || 0) : Infinity;

  if (indice) {
    if (idade >= MAX_AGE_MS) {
      const tarefa = refrescar(env).catch((erro) => {
        console.error('Non se puido refrescar Actualidade en segundo plano:', erro);
      });
      if (typeof waitUntil === 'function') waitUntil(tarefa);
    }

    return json(200, engadirPublicacionProducion({
      ...indice,
      fonte: idade < MAX_AGE_MS ? 'R2-CACHE' : 'R2-STALE-REFRESH'
    }));
  }

  try {
    const actualizado = await refrescar(env);
    return json(200, engadirPublicacionProducion(actualizado));
  } catch (erro) {
    return json(503, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non se puideron cargar as publicacións.',
      fonte: 'ERROR'
    }, 'no-store');
  }
}
