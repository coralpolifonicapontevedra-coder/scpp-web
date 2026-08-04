const INDEX_PATH = 'indices/galeria-publica-v1.json';
const FRESH_MS = 20 * 60 * 1000;

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200
      ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400'
      : 'no-store',
    ...headers
  }
});

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.R2_PUBLICO) {
    return json(500, { ok: false, erro: 'R2 público non está configurado.' });
  }

  const inicio = Date.now();
  const obxecto = await env.R2_PUBLICO.get(INDEX_PATH);
  if (!obxecto) {
    return json(503, {
      ok: false,
      erro: 'O índice R2 aínda non foi xerado polo sincronizador.',
      cache: 'MISSING',
      tempoRespostaMs: Date.now() - inicio
    }, {
      'X-SCPP-Index': 'R2-MISSING',
      'X-SCPP-Cache': 'MISSING'
    });
  }

  const indice = await obxecto.json().catch(() => null);
  if (!indice?.ok || !Array.isArray(indice.fotos)) {
    return json(503, {
      ok: false,
      erro: 'O índice R2 non é válido.',
      cache: 'INVALID',
      tempoRespostaMs: Date.now() - inicio
    }, {
      'X-SCPP-Index': 'R2-INVALID',
      'X-SCPP-Cache': 'INVALID'
    });
  }

  const xeradoEnMs = Number(indice.xeradoEnMs || 0);
  const idadeMs = xeradoEnMs > 0 ? Date.now() - xeradoEnMs : Number.POSITIVE_INFINITY;
  const estado = idadeMs <= FRESH_MS ? 'HIT' : 'STALE';

  return json(200, {
    ...indice,
    cache: estado,
    idadeIndiceMs: Number.isFinite(idadeMs) ? idadeMs : null,
    tempoRespostaMs: Date.now() - inicio
  }, {
    'X-SCPP-Index': 'R2-ONLY',
    'X-SCPP-Cache': estado,
    'X-SCPP-Generated-At': String(xeradoEnMs || '')
  });
}
