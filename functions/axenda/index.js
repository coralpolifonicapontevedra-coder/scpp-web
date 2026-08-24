const SCRIPT_ESTADOS_AXENDA = `<script>
(() => {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const resposta = await fetchOriginal(input, init);
    try {
      const valor = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(valor, window.location.href);
      if (url.pathname !== '/api/concertos-indice' || !resposta.ok) return resposta;
      const datos = await resposta.clone().json();
      if (!Array.isArray(datos?.concertos)) return resposta;
      const concertos = datos.concertos.map((concerto) => {
        const estado = String(concerto?.estado || '').trim().toLowerCase();
        return estado === 'previsto' ? { ...concerto, estado: 'confirmado' } : concerto;
      });
      const headers = new Headers(resposta.headers);
      headers.delete('Content-Length');
      headers.delete('Content-Encoding');
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({ ...datos, concertos }), {
        status: resposta.status,
        statusText: resposta.statusText,
        headers
      });
    } catch (erro) {
      console.warn('Non foi posible adaptar os estados da Axenda.', erro);
      return resposta;
    }
  };
})();
</script>`;

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Método non permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const resposta = await env.ASSETS.fetch(request);
  const tipo = String(resposta.headers.get('Content-Type') || '');
  if (!resposta.ok || !tipo.includes('text/html') || request.method === 'HEAD') return resposta;

  let html = await resposta.text();
  if (!html.includes('Non foi posible adaptar os estados da Axenda.')) {
    html = html.includes('</head>')
      ? html.replace('</head>', `${SCRIPT_ESTADOS_AXENDA}</head>`)
      : `${SCRIPT_ESTADOS_AXENDA}${html}`;
  }

  const headers = new Headers(resposta.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return new Response(html, { status: resposta.status, statusText: resposta.statusText, headers });
}
