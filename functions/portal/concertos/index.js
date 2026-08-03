export async function onRequestGet({ request, env }) {
  const resposta = await env.ASSETS.fetch(request);
  const tipo = String(resposta.headers.get('Content-Type') || '');

  if (!resposta.ok || !tipo.includes('text/html')) {
    return resposta;
  }

  let html = await resposta.text();

  // A páxina debe consultar directamente o endpoint específico de asistencias.
  // Evítanse interceptores de fetch, cachés herdadas e respostas mesturadas co repertorio.
  html = html.replace(
    "fetch('/api/repertorio', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ idToken, accion: 'listarAsistenciasConcertosPortal' })",
    "fetch('/api/asistencias-concertos', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ idToken })"
  );

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
  cabeceiras.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  cabeceiras.set('Pragma', 'no-cache');
  cabeceiras.set('Expires', '0');

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
