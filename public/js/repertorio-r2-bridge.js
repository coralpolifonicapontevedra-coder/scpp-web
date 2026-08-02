(() => {
  'use strict';

  const previousFetch = window.fetch.bind(window);
  const CACHE_KEYS = [
    'scpp:repertorio:completo:v3',
    'scpp:repertorio:completo:v2'
  ];

  function readCompleteCache() {
    for (const key of CACHE_KEYS) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || 'null');
        if (!stored?.ok || !Array.isArray(stored.obras) || !stored.obras.length) continue;
        const hasR2Resources = stored.obras.some((obra) =>
          (Array.isArray(obra?.audios) && obra.audios.some((r) => r?.r2Key || String(r?.ruta || '').startsWith('repertorio/audios/'))) ||
          (Array.isArray(obra?.partituras) && obra.partituras.some((r) => r?.r2Key || String(r?.ruta || '').startsWith('partituras/')))
        );
        if (hasR2Resources) return stored;
      } catch {
        // Proba a seguinte versión da caché.
      }
    }
    return null;
  }

  function isRepertoireList(url, body) {
    return location.pathname.startsWith('/portal/repertorio') &&
      url.includes('/api/repertorio') &&
      body?.accion === 'listarRepertorioPortal';
  }

  function parseBody(init) {
    if (!init || typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const body = parseBody(init);
    const response = await previousFetch(input, init);

    if (!isRepertoireList(url, body) || !response.ok) return response;

    const result = await response.clone().json().catch(() => null);
    if (!result?.ok || !Array.isArray(result.obras)) return response;

    const source = response.headers.get('X-SCPP-Repertorio');
    if (source === 'FULL' || result?.indiceR2?.completo === true) return response;

    const complete = readCompleteCache();
    if (!complete) return response;

    return new Response(JSON.stringify({
      ...result,
      ok: true,
      obras: complete.obras,
      indiceR2: complete.indiceR2 || result.indiceR2,
      modoCarga: 'r2-cache-completa'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-SCPP-Repertorio': 'R2-CACHE-COMPLETA'
      }
    });
  };
})();
