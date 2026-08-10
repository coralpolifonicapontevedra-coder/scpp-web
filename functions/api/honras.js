const INDEX_KEY = 'indices/honras-v1.json';

const json = (status, body, cache = 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff'
    }
  });

function respostaValida(datos) {
  return datos?.ok === true && datos?.version === 1 && Array.isArray(datos?.honras);
}

export async function onRequestGet({ env }) {
  if (!env.R2_PUBLICO) {
    return json(503, { ok: false, erro: 'R2 público non dispoñible.' }, 'no-store');
  }

  try {
    const obxecto = await env.R2_PUBLICO.get(INDEX_KEY);
    if (!obxecto) {
      return json(503, { ok: false, erro: 'O índice de honras aínda non está dispoñible.' }, 'no-store');
    }

    const datos = await obxecto.json().catch(() => null);
    if (!respostaValida(datos)) {
      return json(503, { ok: false, erro: 'O índice de honras non é válido.' }, 'no-store');
    }

    return json(200, { ...datos, fonte: 'R2-CACHE' });
  } catch (erro) {
    return json(503, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non foi posible cargar as honras.'
    }, 'no-store');
  }
}
