export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Método non permitido', { status:405, headers:{ Allow:'GET, HEAD' } });
  }

  const resposta = await env.ASSETS.fetch(request);
  const tipo = String(resposta.headers.get('Content-Type') || '');
  if (!resposta.ok || !tipo.includes('text/html') || request.method === 'HEAD') return resposta;

  let html = await resposta.text();
  const recurso = '<script src="/js/ensaios-admin-finalizar-v2.js?v=2"></script>';
  if (!html.includes('/js/ensaios-admin-finalizar-v2.js')) {
    if (html.includes('</head>')) html = html.replace('</head>', `${recurso}</head>`);
    else html = `${recurso}${html}`;
  }

  const headers = new Headers(resposta.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control','private, no-store');
  headers.set('X-SCPP-Admin-Ensaios','r2-compartido-finalizar-v2');

  return new Response(html, { status:resposta.status, statusText:resposta.statusText, headers });
}