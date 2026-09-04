(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/administracion/concertos')) return;
  if (window.__scppConcertosAdminSheetSource) return;
  window.__scppConcertosAdminSheetSource = true;

  // Evita que o interceptor legado de AdministracionNav volva forzar a Sheet.
  window.__scppConcertosAdminSheetProbas = true;

  const fetchNativo = window.fetch.bind(window);

  window.fetch = async (input, init) => {
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

      if (body?.accion === 'listar') {
        const respostaRapida = await fetchNativo('/api/concertos-admin-fast-list', init);
        if (respostaRapida.ok) return respostaRapida;
        return fetchNativo('/api/concertos-admin-list', init);
      }

      if (body?.accion === 'subirMedio') {
        url.pathname = '/api/concertos-admin-medio';
        const destino = typeof input === 'string'
          ? `${url.pathname}${url.search}`
          : new Request(url.toString(), input);
        return fetchNativo(destino, init);
      }

      return fetchNativo(input, init);
    } catch {
      return fetchNativo(input, init);
    }
  };
})();
