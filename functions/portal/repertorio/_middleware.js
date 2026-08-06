export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  // portal-fast-load.js xa resolve a carga inicial sen bloquear a interface e
  // actualiza o catálogo completo en segundo plano. O antigo interceptor
  // repertorio-direct-api.js substituía ese fluxo por un XHR de ata 65 s, de
  // modo que ao caducar a caché de Cloudflare a páxina quedaba cargando.
  // Mantemos unicamente a ponte que organiza os audios especiais na interface.
  const scripts = '<script src="/js/repertorio-r2-bridge.js?v=20260806-1"></script>';
  const body = html.includes('</body>')
    ? html.replace('</body>', `${scripts}</body>`)
    : `${html}${scripts}`;

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
