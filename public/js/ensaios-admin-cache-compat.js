(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/api/ensaios') && init?.method === 'POST' && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        if (body?.accion === 'listarEnsaiosPortal' && body?.forzar === true) {
          init = { ...init, body: JSON.stringify({ ...body, forzar: false }) };
        }
      } catch {
        // Mantén a solicitude orixinal se non é JSON válido.
      }
    }
    return originalFetch(input, init);
  };
})();
