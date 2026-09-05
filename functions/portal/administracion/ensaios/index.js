export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Método non permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  return env.ASSETS.fetch(request);
}
