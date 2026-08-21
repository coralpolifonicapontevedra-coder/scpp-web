const RUTA_IMPLEMENTACION = '/portal/concertos-novo/';

function requestImplementacion(request) {
  const url = new URL(request.url);
  url.pathname = RUTA_IMPLEMENTACION;
  return new Request(url.toString(), request);
}

export async function onRequestGet({ request, env }) {
  const resposta = await env.ASSETS.fetch(requestImplementacion(request));
  const tipo = String(resposta.headers.get('Content-Type') || '');

  if (!resposta.ok || !tipo.includes('text/html')) {
    return resposta;
  }

  let html = await resposta.text();

  // Só en Preview: redirixir temporalmente a consulta de asistencias a un
  // endpoint de diagnóstico seguro. Non se modifica main nin Producción.
  html = html.replaceAll(
    '/api/asistencias-concertos',
    '/api/asistencias-concertos-debug'
  );

  const recursos = [
    '<link rel="stylesheet" href="/css/concertos-novo-clasico.css?v=2">',
    '<link rel="stylesheet" href="/css/concertos-novo-informe.css?v=1">',
    '<script type="module" src="/js/concertos-novo-clasico.js?v=2"></script>'
  ];

  recursos.forEach((recurso) => {
    const coincidencia = recurso.match(/(?:href|src)="([^"]+)"/);
    const identificador = coincidencia?.[1]?.split('?')[0] || '';
    if (identificador && html.includes(identificador)) return;

    if (recurso.includes('stylesheet') && html.includes('</head>')) {
      html = html.replace('</head>', `${recurso}</head>`);
    } else if (html.includes('</body>')) {
      html = html.replace('</body>', `${recurso}</body>`);
    } else {
      html += recurso;
    }
  });

  const cabeceiras = new Headers(resposta.headers);
  cabeceiras.delete('Content-Length');
  cabeceiras.delete('Content-Encoding');
  cabeceiras.delete('ETag');
  cabeceiras.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  cabeceiras.set('Pragma', 'no-cache');
  cabeceiras.set('Expires', '0');
  cabeceiras.set('X-SCPP-Concertos-Version', 'oficial-v2');
  cabeceiras.set('X-SCPP-Asistencias-Debug', 'preview');

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