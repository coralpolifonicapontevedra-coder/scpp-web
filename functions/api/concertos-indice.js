const INDEX_KEY_MAIN = 'indices/concertos-v1.json';
const INDEX_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

const clean = (value = '') => String(value || '').trim();
const rama = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const normalizarEstado = (value = '') => clean(value).toLowerCase();
const estadoPublicable = (value = '') => ['previsto', 'confirmado', 'realizado'].includes(normalizarEstado(value));
const visibleNaWeb = (concerto) => concerto?.mostrarWeb === true && estadoPublicable(concerto?.estado);

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' }, {
      'Cache-Control': 'no-store'
    });
  }

  const branch = rama(env);
  const preview = branch !== 'main';
  const bucket = preview ? env.R2_PRIVADO : env.R2_PUBLICO;
  const key = preview ? INDEX_KEY_PREVIEW : INDEX_KEY_MAIN;

  if (!bucket) {
    return json(500, { ok: false, erro: 'O bucket de concertos non está configurado.' }, {
      'Cache-Control': 'no-store',
      'X-SCPP-Concertos-Index': 'UNCONFIGURED'
    });
  }

  const started = Date.now();
  const object = await bucket.get(key);
  if (!object) {
    return json(503, { ok: false, erro: `O índice de concertos de ${branch} aínda non está dispoñible.` }, {
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

  const concertos = index.concertos.filter(visibleNaWeb);
  const elapsed = Date.now() - started;
  return json(200, {
    ...index,
    total: concertos.length,
    concertos,
    regraPublicacion: 'Mostrar_Web + Previsto/Confirmado/Realizado',
    cache: 'R2',
    rama: branch,
    tempoRespostaMs: elapsed
  }, {
    'X-SCPP-Concertos-Index': preview ? 'R2-PRIVADO-PREVIEW' : 'R2-PUBLICO-MAIN',
    'X-SCPP-Concertos-Version': String(index.xeradoEnMs || index.xeradoEn || ''),
    'X-SCPP-Concertos-Publication-Rule': 'mostrar-web-previsto-confirmado-realizado',
    'Server-Timing': `r2;dur=${elapsed}`
  });
}
