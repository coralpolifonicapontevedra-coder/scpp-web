export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Método non permitido', { status:405, headers:{ Allow:'GET, HEAD' } });
  }

  const resposta = await env.ASSETS.fetch(request);
  const tipo = String(resposta.headers.get('Content-Type') || '');
  if (!resposta.ok || !tipo.includes('text/html') || request.method === 'HEAD') return resposta;

  let html = await resposta.text();
  const recurso = '<script src="/js/ensaios-admin-rapido.js?v=1"></script>';
  if (!html.includes('/js/ensaios-admin-rapido.js')) {
    if (html.includes('</head>')) html = html.replace('</head>', `${recurso}</head>`);
    else html = `${recurso}${html}`;
  }

  const headers = new Headers(resposta.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control','private, no-store');
  headers.set('X-SCPP-Admin-Ensaios','rapido-r2-v1');

  return new Response(html, { status:resposta.status, statusText:resposta.statusText, headers });
}
