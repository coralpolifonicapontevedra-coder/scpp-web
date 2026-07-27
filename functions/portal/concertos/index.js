export async function onRequestGet({ request, env }) {
  const resposta = await env.ASSETS.fetch(request);
  const tipo = String(resposta.headers.get('Content-Type') || '');

  if (!resposta.ok || !tipo.includes('text/html')) {
    return resposta;
  }

  let html = await resposta.text();
  const melloras = [
    '<style>#concert-document-name{display:none!important}</style>',
    '<script type="module" src="/js/concertos-media.js"></script>',
    '<script type="module" src="/js/concertos-cards.js"></script>'
  ];

  melloras.forEach((mellora) => {
    const src = mellora.match(/src="([^"]+)"/)?.[1] || '';
    const identificador = src || '#concert-document-name{display:none!important}';
    if (html.includes(identificador)) return;
    html = html.includes('</body>')
      ? html.replace('</body>', `${mellora}</body>`)
      : `${html}${mellora}`;
  });

  const cabeceiras = new Headers(resposta.headers);
  cabeceiras.delete('Content-Length');
  cabeceiras.delete('Content-Encoding');
  cabeceiras.delete('ETag');
  cabeceiras.set('Cache-Control', 'no-cache');

  return new Response(html, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers: cabeceiras
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return onRequestGet({ request, env });
  }

  return new Response('Método non permitido', {
    status: 405,
    headers: { Allow: 'GET, HEAD' }
  });
}
