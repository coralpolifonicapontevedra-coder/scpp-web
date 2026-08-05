const INXECCION = `<script>
(() => {
  const fetchBase = window.fetch.bind(window);
  const appsScript = 'https://script.google.com/macros/s/AKfycbwKBDO5bvPxlXhsJTDvQHtx313rfN_BQIb3JX69X_qg6nZUOHDu183AGLh7JTIoN1a9/exec';
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (url === appsScript) {
      return fetchBase('/api/coralistas', { ...(init || {}), cache: 'default', redirect: 'follow' });
    }
    return fetchBase(input, init);
  };
})();
</script>`;

export async function onRequest(context) {
  const resposta = await context.next();
  const tipo = String(resposta.headers.get('Content-Type') || '');
  if (!resposta.ok || !tipo.includes('text/html')) return resposta;

  let html = await resposta.text();
  html = html.includes('</head>')
    ? html.replace('</head>', INXECCION + '</head>')
    : INXECCION + html;

  const headers = new Headers(resposta.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');

  return new Response(html, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers
  });
}
