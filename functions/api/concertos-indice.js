const INDEX_KEY = 'indices/concertos-v1.json';
const PREVIEW_INDEX_KEY = 'indices/preview/concertos-v1.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

function keyParaRequest(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  const preview = host.endsWith('.scpp-web.pages.dev') && host !== 'scpp-web.pages.dev';
  return { preview, key:preview ? PREVIEW_INDEX_KEY : INDEX_KEY };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' }, {
      'Cache-Control': 'no-store'
    });
  }

  if (!env.R2_PUBLICO) {
    return json(500, { ok: false, erro: 'O bucket público R2 non está configurado.' }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Concertos-Index': 'UNCONFIGURED'
    });
  }

  const context = keyParaRequest(request);
  const started = Date.now();
  let object = await env.R2_PUBLICO.get(context.key);
  let keyUsada = context.key;
  if (!object && context.preview) {
    object = await env.R2_PUBLICO.get(INDEX_KEY);
    keyUsada = INDEX_KEY;
  }
  if (!object) {
    return json(503, { ok: false, erro: 'O índice de concertos aínda non está dispoñible.' }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Concertos-Index': 'MISSING'
    });
  }

  const index = await object.json().catch(() => null);
  if (
    index?.ok !== true ||
    Number(index?.version) !== 1 ||
    !Array.isArray(index?.concertos)
  ) {
    return json(503, { ok: false, erro: 'O índice de concertos non é válido.' }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Concertos-Index': 'INVALID'
    });
  }

  const elapsed = Date.now() - started;
  return json(200, {
    ...index,
    cache: 'R2',
    ambiente:context.preview ? 'preview' : 'production',
    tempoRespostaMs: elapsed
  }, {
    'X-SCPP-Concertos-Index': context.preview ? 'R2-PREVIEW' : 'R2',
    'X-SCPP-Concertos-Key': keyUsada,
    'X-SCPP-Concertos-Version': String(index.xeradoEnMs || index.xeradoEn || ''),
    'Server-Timing': `r2;dur=${elapsed}`
  });
}
