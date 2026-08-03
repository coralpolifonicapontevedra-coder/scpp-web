const responderJson = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

function obterChave(params) {
  const segmentos = Array.isArray(params.ruta)
    ? params.ruta
    : [params.ruta];

  return segmentos
    .map((segmento) => String(segmento || '').trim())
    .filter(Boolean)
    .join('/');
}

function claveValida(chave) {
  return Boolean(chave) &&
    !chave.includes('..') &&
    !chave.startsWith('/') &&
    !chave.includes('\\');
}

async function responderObxecto(bucket, chave, request, senCorpo = false) {
  const obxecto = await bucket.get(chave, {
    onlyIf: request.headers,
    range: request.headers
  });

  if (obxecto === null) {
    return responderJson(404, {
      ok: false,
      erro: 'Arquivo non atopado'
    });
  }

  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('ETag', obxecto.httpEtag);
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=60');
  headers.set('X-Content-Type-Options', 'nosniff');

  if (request.headers.has('Range') && 'range' in obxecto) {
    const range = obxecto.range;
    headers.set(
      'Content-Range',
      `bytes ${range.offset}-${range.offset + range.length - 1}/${obxecto.size}`
    );
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(range.length));
  } else {
    headers.set('Content-Length', String(obxecto.size));
  }

  if (!('body' in obxecto)) {
    return new Response(null, {
      status: 412,
      headers
    });
  }

  return new Response(senCorpo ? null : obxecto.body, {
    status: request.headers.has('Range') ? 206 : 200,
    headers
  });
}

export async function onRequestGet({ request, env, params }) {
  if (!env.R2_PUBLICO) {
    return responderJson(503, {
      ok: false,
      erro: 'O almacén público non está configurado'
    });
  }

  const chave = obterChave(params);
  if (!claveValida(chave)) {
    return responderJson(400, {
      ok: false,
      erro: 'Ruta de arquivo non válida'
    });
  }

  return responderObxecto(env.R2_PUBLICO, chave, request, false);
}

export async function onRequestHead({ request, env, params }) {
  if (!env.R2_PUBLICO) {
    return new Response(null, { status: 503 });
  }

  const chave = obterChave(params);
  if (!claveValida(chave)) {
    return new Response(null, { status: 400 });
  }

  return responderObxecto(env.R2_PUBLICO, chave, request, true);
}

export function onRequest() {
  return responderJson(405, {
    ok: false,
    erro: 'Método non permitido'
  });
}
