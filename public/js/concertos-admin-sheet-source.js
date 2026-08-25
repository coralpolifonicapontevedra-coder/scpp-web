(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/administracion/concertos')) return;
  if (window.__scppConcertosAdminSheetSource) return;
  window.__scppConcertosAdminSheetSource = true;

  const fetchNativo = window.fetch.bind(window);

  window.fetch = (input, init) => {
    try {
      const valor = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input || '');
      const url = new URL(valor, window.location.href);

      if (url.pathname !== '/api/concertos-admin') return fetchNativo(input, init);
      if (typeof init?.body !== 'string') return fetchNativo(input, init);

      const body = JSON.parse(init.body);
      if (body?.accion !== 'listar') return fetchNativo(input, init);

      url.pathname = '/api/concertos-admin-list';
      const destino = typeof input === 'string'
        ? `${url.pathname}${url.search}`
        : new Request(url.toString(), input);

      return fetchNativo(destino, init);
    } catch {
      return fetchNativo(input, init);
    }
  };
})();
