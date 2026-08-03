const DESTINO_CONCERTOS = '/portal/concertos/';

function redirixir(request) {
  const url = new URL(request.url);
  url.pathname = DESTINO_CONCERTOS;
  return Response.redirect(url.toString(), 308);
}

export async function onRequestGet({ request }) {
  return redirixir(request);
}

export async function onRequestHead({ request }) {
  return redirixir(request);
}

export async function onRequest({ request }) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return redirixir(request);
  }

  return new Response('Método non permitido', {
    status: 405,
    headers: { Allow: 'GET, HEAD' }
  });
}