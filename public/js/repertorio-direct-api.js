(() => {
  'use strict';

  const fetchAnterior = window.fetch.bind(window);

  function parseBody(init) {
    if (!init || typeof init.body !== 'string') return null;
    try {
      return JSON.parse(init.body);
    } catch {
      return null;
    }
  }

  function solicitarApiDirecta(url, init) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(String(init?.method || 'POST'), url, true);
      xhr.responseType = 'text';

      const headers = init?.headers;
      if (headers instanceof Headers) {
        headers.forEach((value, key) => xhr.setRequestHeader(key, value));
      } else if (Array.isArray(headers)) {
        headers.forEach(([key, value]) => xhr.setRequestHeader(key, value));
      } else if (headers && typeof headers === 'object') {
        Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, String(value)));
      }

      xhr.onload = () => {
        const responseHeaders = new Headers();
        const raw = xhr.getAllResponseHeaders();
        raw.trim().split(/[\r\n]+/).filter(Boolean).forEach((line) => {
          const index = line.indexOf(':');
          if (index > 0) responseHeaders.append(line.slice(0, index).trim(), line.slice(index + 1).trim());
        });
        responseHeaders.set('X-SCPP-Repertorio', 'DIRECT-API');
        resolve(new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: responseHeaders
        }));
      };
      xhr.onerror = () => reject(new TypeError('Non foi posible conectar co servizo de repertorio.'));
      xhr.ontimeout = () => reject(new TypeError('O servizo de repertorio tardou demasiado en responder.'));
      xhr.timeout = 65000;
      xhr.send(typeof init?.body === 'string' ? init.body : null);
    });
  }

  window.fetch = (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : String(input);
    const body = parseBody(init);

    if (
      location.pathname.startsWith('/portal/repertorio') &&
      url.includes('/api/repertorio') &&
      body?.accion === 'listarRepertorioPortal'
    ) {
      return solicitarApiDirecta(url, init);
    }

    return fetchAnterior(input, init);
  };
})();
