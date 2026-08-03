export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const script = '<script src="/js/concertos-asistencias-retry.js?v=20260803-1"></script>';
  const body = html.includes('</body>')
    ? html.replace('</body>', `${script}</body>`)
    : `${html}${script}`;

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store');

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
