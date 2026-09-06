export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const scripts = [
    '<script src="/js/repertorio-direct-api.js?v=20260906-r2sync-1"></script>',
    '<script src="/js/repertorio-r2-bridge.js?v=20260906-r2sync-1"></script>'
  ].join('');
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
