(() => {
  const ruta = window.location.pathname.replace(/\/+$/, '') || '/';
  if (ruta !== '/es/actualidad') return;

  const rutasPdf = new Map([
    ['/documentos/publicacions/2026-07-02_ficha_diario-mocidade-coral.pdf', '/documentos/publicacions/2026-07-02_ficha_diario-mocidade-coral-es.pdf'],
    ['/documentos/publicacions/2026-03-28_ficha_faro-vieira-honra.pdf', '/documentos/publicacions/2026-03-28_ficha_faro-vieira-honra-es.pdf'],
    ['/documentos/publicacions/2026-03-30_ficha_diario-respaldo-oficial.pdf', '/documentos/publicacions/2026-03-30_ficha_diario-respaldo-oficial-es.pdf'],
    ['/documentos/publicacions/2026-04-09_ficha_diario-jose-raposeiras.pdf', '/documentos/publicacions/2026-04-09_ficha_diario-jose-raposeiras-es.pdf'],
    ['/documentos/publicacions/2026-04-29_ficha_deputacion-recepcion-directiva.pdf', '/documentos/publicacions/2026-04-29_ficha_deputacion-recepcion-directiva-es.pdf'],
    ['/documentos/publicacions/2026-07-15_ficha_faro-agustin-bertomeu.pdf', '/documentos/publicacions/2026-07-15_ficha_faro-agustin-bertomeu-es.pdf'],
    ['/documentos/publicacions/2026-07-16_ficha_diario-agustin-bertomeu.pdf', '/documentos/publicacions/2026-07-16_ficha_diario-agustin-bertomeu-es.pdf'],
    ['/documentos/publicacions/bicentenario-marcial-del-adalid.pdf', '/documentos/publicacions/bicentenario-marcial-del-adalid-es.pdf']
  ]);

  const resolverRutaEs = (href) => {
    if (!href) return '';
    try {
      const url = new URL(href, window.location.origin);
      if (url.pathname.endsWith('-es.pdf')) return url.pathname;
      return rutasPdf.get(url.pathname) || '';
    } catch {
      return '';
    }
  };

  const selector = '#destacada-titulo-ligazon, #destacada-ligazon, .publicacion h3 a, .publicacion-pe a';

  const corregirEnlaces = () => {
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLAnchorElement)) return;
      const rutaEs = resolverRutaEs(node.getAttribute('href'));
      if (rutaEs && node.getAttribute('href') !== rutaEs) node.setAttribute('href', rutaEs);
    });
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    const rutaEs = resolverRutaEs(target.getAttribute('href'));
    if (!rutaEs) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(rutaEs);
  }, true);

  const raiz = document.querySelector('.actualidade');
  if (!raiz) return;
  corregirEnlaces();
  const observer = new MutationObserver(corregirEnlaces);
  observer.observe(raiz, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
})();
