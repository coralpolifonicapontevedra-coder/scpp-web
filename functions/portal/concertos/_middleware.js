export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();

  const body = html.replace(
    "fetch('/api/repertorio', {",
    "fetch('/api/asistencias-concertos', {"
  );

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
