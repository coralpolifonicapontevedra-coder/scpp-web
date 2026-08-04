const INXECCION = `
<script>
(function(){
  const fetchBase = window.fetch.bind(window);
  window.fetch = function(input, init = {}) {
    try {
      const valor = typeof input === 'string' ? input : String(input?.url || '');
      if (valor.includes('/api/galeria') && !valor.includes('/api/galeria-orixinal')) {
        const url = new URL(valor, window.location.origin);
        url.searchParams.set('_indice', String(Date.now()));
        return fetchBase(url.toString(), {
          ...init,
          cache: 'no-store',
          headers: {
            ...(init.headers || {}),
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
      }
    } catch (_) { }
    return fetchBase(input, init);
  };
})();
</script>`;

export async function onRequest(context) {
  const resposta = await context.next();
  const tipo = String(resposta.headers.get('Content-Type') || '');
  if (!resposta.ok || !tipo.includes('text/html')) return resposta;

  let html = await resposta.text();
  if (!html.includes("url.searchParams.set('_indice'")) {
    html = html.includes('</head>')
      ? html.replace('</head>', `${INXECCION}</head>`)
      : `${INXECCION}${html}`;
  }

  const headers = new Headers(resposta.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  return new Response(html, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers
  });
}
