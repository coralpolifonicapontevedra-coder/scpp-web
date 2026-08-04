const INDEX_PATH = 'indices/galeria-publica-v1.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
    ...extraHeaders
  }
});

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' }, { 'Cache-Control': 'no-store' });
  }

  if (!env.R2_PUBLICO) {
    return json(500, { ok: false, erro: 'O bucket público R2 non está configurado.' }, { 'Cache-Control': 'no-store' });
  }

  const inicio = Date.now();
  const obxecto = await env.R2_PUBLICO.get(INDEX_PATH);
  if (!obxecto) {
    return json(503, {
      ok: false,
      erro: 'O índice da galería aínda non está dispoñible.'
    }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Index': 'MISSING'
    });
  }

  const indice = await obxecto.json().catch(() => null);
  if (!indice?.ok || !Array.isArray(indice.fotos)) {
    return json(503, {
      ok: false,
      erro: 'O índice da galería non é válido.'
    }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Index': 'INVALID'
    });
  }

  return json(200, {
    ...indice,
    cache: 'R2',
    tempoRespostaMs: Date.now() - inicio
  }, {
    'X-SCPP-Index': 'R2',
    'X-SCPP-Cache': 'HIT',
    'Server-Timing': `r2;dur=${Date.now() - inicio}`
  });
}
