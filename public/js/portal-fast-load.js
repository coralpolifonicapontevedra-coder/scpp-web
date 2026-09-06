(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);
  const CACHE_KEY = 'scpp:repertorio:rapido:v3';
  const CACHE_TTL_MS = 60 * 1000;
  const LIST_ENDPOINT = '/api/repertorio-cache-v2';

  const jsonResponse = (body, estado) => new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-SCPP-Repertorio': estado
    }
  });

  function parseBody(init) {
    if (!init || typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  function readCache() {
    try {
      const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!stored?.body || Date.now() - Number(stored.savedAt || 0) > CACHE_TTL_MS) return null;
      const parsed = JSON.parse(stored.body);
      return parsed?.ok === true && Array.isArray(parsed?.obras) ? stored : null;
    } catch {
      return null;
    }
  }

  function saveCache(text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.ok !== true || !Array.isArray(parsed?.obras)) return;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), body: text }));
    } catch {}
  }

  async function requestCatalog(init) {
    const response = await originalFetch(LIST_ENDPOINT, {
      method: 'POST',
      headers: init?.headers || { 'Content-Type': 'application/json' },
      body: typeof init?.body === 'string' ? init.body : null,
      cache: 'no-store'
    });
    const text = await response.clone().text();
    if (response.ok) saveCache(text);
    return response;
  }

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const body = parseBody(init);

    if (
      location.pathname.startsWith('/portal/repertorio') &&
      url.includes('/api/repertorio') &&
      body?.accion === 'listarRepertorioPortal'
    ) {
      const cached = readCache();
      if (cached) {
        requestCatalog(init).catch(() => {});
        return jsonResponse(JSON.parse(cached.body), 'LOCAL-R2-CACHE');
      }
      try {
        return await requestCatalog(init);
      } catch {
        return jsonResponse({ ok: false, erro: 'Non foi posible cargar a caché R2 de Repertorio.' }, 'R2-CACHE-ERROR');
      }
    }

    return originalFetch(input, init);
  };
})();
