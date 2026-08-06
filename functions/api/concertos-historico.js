const INDEX_KEY = 'indices/concertos-historico-v1.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' }, {
      'Cache-Control': 'no-store'
    });
  }

  if (!env.R2_PUBLICO) {
    return json(500, { ok: false, erro: 'O bucket público R2 non está configurado.' }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Concertos-Historico': 'UNCONFIGURED'
    });
  }

  const started = Date.now();
  const object = await env.R2_PUBLICO.get(INDEX_KEY);
  if (!object) {
    return json(503, { ok: false, erro: 'O índice de histórico de concertos aínda non está dispoñible.' }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Concertos-Historico': 'MISSING'
    });
  }

  const index = await object.json().catch(() => null);
  if (
    index?.ok !== true ||
    Number(index?.version) !== 1 ||
    !Array.isArray(index?.concertos)
  ) {
    return json(503, { ok: false, erro: 'O índice histórico de concertos non é válido.' }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Concertos-Historico': 'INVALID'
    });
  }

  const elapsed = Date.now() - started;
  return json(200, {
    ...index,
    cache: 'R2',
    tempoRespostaMs: elapsed
  }, {
    'X-SCPP-Concertos-Historico': 'R2',
    'X-SCPP-Concertos-Version': String(index.xeradoEnMs || index.xeradoEn || ''),
    'Server-Timing': `r2;dur=${elapsed}`
  });
}
