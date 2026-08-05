(()=>{
  const fetchBase = window.fetch.bind(window);
  const ORIXE_PUBLICACIONS = 'recurso=publicacions';

  window.fetch = function(input, init = {}) {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (url.includes('script.google.com/macros/') && url.includes(ORIXE_PUBLICACIONS)) {
      return fetchBase('/api/actualidade', {
        ...init,
        method: 'GET',
        cache: 'default',
        redirect: 'follow'
      });
    }
    return fetchBase(input, init);
  };
})();
