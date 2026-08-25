const RUTA_IMPLEMENTACION = '/portal/concertos-novo/';

function requestImplementacion(request) {
  const url = new URL(request.url);
  url.pathname = RUTA_IMPLEMENTACION;
  return new Request(url.toString(), request);
}

const scriptAsistenciasPreview = `<script>
(() => {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const valor = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(valor, window.location.href);
      if (url.pathname === '/api/asistencias-concertos') {
        url.pathname = '/api/asistencias-concertos-preview';
        const destino = typeof input === 'string' ? url.pathname + url.search : new Request(url.toString(), input);
        return fetchOriginal(destino, init);
      }
    } catch (erro) {
      console.warn('Non foi posible activar as asistencias illadas de Preview.', erro);
    }
    return fetchOriginal(input, init);
  };
})();
</script>`;

export async function onRequestGet({ request, env }) {
  const resposta = await env.ASSETS.fetch(requestImplementacion(request));
  const tipo = String(resposta.headers.get('Content-Type') || '');

  if (!resposta.ok || !tipo.includes('text/html')) {
    return resposta;
  }

  let html = await resposta.text();
  const branch = String(env.CF_PAGES_BRANCH || '').trim();

  if (branch !== 'main' && !html.includes('/api/asistencias-concertos-preview')) {
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${scriptAsistenciasPreview}</head>`);
    } else {
      html = `${scriptAsistenciasPreview}${html}`;
    }
  }

  const recursos = [
    '<link rel="stylesheet" href="/css/concertos-novo-clasico.css?v=2">',
    '<link rel="stylesheet" href="/css/concertos-novo-informe.css?v=1">',
    '<link rel="stylesheet" href="/css/concertos-seccions.css?v=1">',
    '<script type="module" src="/js/concertos-novo-clasico.js?v=2"></script>',
    '<script type="module" src="/js/concertos-program-links.js?v=1"></script>',
    '<script type="module" src="/js/concertos-cartel-r2.js?v=2"></script>',
    '<script type="module" src="/js/concertos-seccions.js?v=1"></script>',
    '<script src="/js/concertos-informe-r2.js?v=2"></script>'
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
  cabeceiras.set('X-SCPP-Concertos-Version', 'oficial-v7-cartel-r2-contorno');

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
