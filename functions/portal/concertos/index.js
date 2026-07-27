export async function onRequestGet({ request, env }) {
  const resposta = await env.ASSETS.fetch(request);
  const tipo = String(resposta.headers.get('Content-Type') || '');

  if (!resposta.ok || !tipo.includes('text/html')) {
    return resposta;
  }

  let html = await resposta.text();
  const melloras = [
    '<style>#concert-document-name{display:none!important}</style>',
    '<script type="module" src="/js/concertos-media.js"></script>'
  ].join('');

  if (!html.includes('/js/concertos-media.js')) {
    html = html.includes('</body>')
      ? html.replace('</body>', `${melloras}</body>`)
      : `${html}${melloras}`;
  } else if (!html.includes('#concert-document-name{display:none!important}')) {
    html = html.includes('</head>')
      ? html.replace('</head>', '<style>#concert-document-name{display:none!important}</style></head>')
      : `<style>#concert-document-name{display:none!important}</style>${html}`;
  }

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
