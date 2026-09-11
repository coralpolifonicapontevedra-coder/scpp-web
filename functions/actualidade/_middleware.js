const ORIXE = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec?recurso=publicacions';
const PRENSA_SCRIPT = '<script src="/js/actualidade-prensa-20260828.js?v=20260901-1"></script>';
const ADALID_SCRIPT = '<script src="/js/actualidade-adalid-20260910.js?v=20260911-1"></script>';

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!response.ok || !contentType.includes('text/html')) return response;

  let html = await response.text();
  html = html
    .replace(ORIXE, '/api/actualidade')
    .replace("cache: 'no-store'", "cache: 'default'");

  if (!html.includes('/js/actualidade-prensa-20260828.js')) html = html.replace('</body>', `${PRENSA_SCRIPT}</body>`);
  if (!html.includes('/js/actualidade-adalid-20260910.js')) html = html.replace('</body>', `${ADALID_SCRIPT}</body>`);

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');

  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}
