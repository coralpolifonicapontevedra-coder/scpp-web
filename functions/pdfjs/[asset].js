const PDFJS_VERSION = '3.11.174';
const ASSETS = new Set(['pdf.min.js', 'pdf.worker.min.js']);

export async function onRequestGet(context) {
  const asset = String(context?.params?.asset || '').trim();
  if (!ASSETS.has(asset)) {
    return new Response('Not found', { status: 404 });
  }

  const cache = caches.default;
  const requestUrl = new URL(context.request.url);
  const cacheKey = new Request(requestUrl.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstreamUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/${asset}`;
  const upstream = await fetch(upstreamUrl, {
    headers: { 'User-Agent': 'SCPP-Preview-PDFJS/1.0' }
  });

  if (!upstream.ok) {
    return new Response('PDF.js non dispoñible', { status: 502 });
  }

  const headers = new Headers(upstream.headers);
  headers.set('Content-Type', 'application/javascript; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');

  const response = new Response(upstream.body, {
    status: 200,
    headers
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
