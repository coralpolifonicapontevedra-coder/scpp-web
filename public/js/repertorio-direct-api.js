(() => {
  'use strict';

  const fetchAnterior = window.fetch.bind(window);
  const CACHE_KEY = 'scpp:repertorio:completo:v6';
  const CACHE_FRESH_MS = 60 * 1000;
  const CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const LIST_ENDPOINT = '/api/repertorio-cache-v2';

  function lerCache(permitirAntiga = false) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      const idade = Date.now() - Number(cached?.gardadoEn || 0);
      if (!cached?.body || idade < 0 || idade > (permitirAntiga ? CACHE_STALE_MS : CACHE_FRESH_MS)) return null;
      const parsed = JSON.parse(cached.body);
      return parsed?.ok === true && Array.isArray(parsed?.obras) ? cached : null;
    } catch {
      return null;
    }
  }

  function gardarCache(body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed?.ok !== true || !Array.isArray(parsed?.obras)) return;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ gardadoEn: Date.now(), body }));
    } catch {}
  }

  function respostaCache(cached, estado) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-SCPP-Repertorio': estado
      }
    });
  }

  function parseBody(init) {
    if (!init || typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  function solicitarCatalogo(init) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', LIST_ENDPOINT, true);
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
        if (xhr.status >= 200 && xhr.status < 300) gardarCache(xhr.responseText);
        const responseHeaders = new Headers();
        const raw = xhr.getAllResponseHeaders();
        raw.trim().split(/[\r\n]+/).filter(Boolean).forEach((line) => {
          const index = line.indexOf(':');
          if (index > 0) responseHeaders.append(line.slice(0, index).trim(), line.slice(index + 1).trim());
        });
        responseHeaders.set('X-SCPP-Repertorio', 'R2-SYNC-DIRECT');
        resolve(new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: responseHeaders
        }));
      };

      const recuperar = (mensaxe) => {
        const cached = lerCache(true);
        if (cached) resolve(respostaCache(cached, 'STALE-LOCAL-CACHE'));
        else reject(new TypeError(mensaxe));
      };
      xhr.onerror = () => recuperar('Non foi posible conectar coa caché de Repertorio.');
      xhr.ontimeout = () => recuperar('A sincronización de Repertorio tardou demasiado.');
      xhr.timeout = 35000;
      xhr.send(typeof init?.body === 'string' ? init.body : null);
    });
  }

  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const body = parseBody(init);

    if (
      location.pathname.startsWith('/portal/repertorio') &&
      url.includes('/api/repertorio') &&
      body?.accion === 'listarRepertorioPortal'
    ) {
      const cached = lerCache(false);
      if (cached) {
        solicitarCatalogo(init).catch(() => {});
        return Promise.resolve(respostaCache(cached, 'LOCAL-R2-CACHE'));
      }
      return solicitarCatalogo(init);
    }

    return fetchAnterior(input, init);
  };
})();
