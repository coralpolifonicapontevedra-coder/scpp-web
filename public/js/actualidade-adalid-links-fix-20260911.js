(() => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isEs = path === '/es/actualidad';
  const isGl = path === '/actualidade' || path === '/gl/actualidade';
  if (!isEs && !isGl) return;

  const targets = isEs ? new Map([
    ['La Voz de Galicia', '/documentos/publicacions/2026-09-09_xunta-alto-nivel-musica-coral-es.pdf'],
    ['Xunta de Galicia', '/documentos/publicacions/2026-09-09_laopinion-bicentenario-adalid-es.pdf'],
    ['La Opinión A Coruña', '/documentos/publicacions/2026-09-10_diariosantiago-oito-corais-es.pdf'],
    ['Diario de Santiago', '/documentos/publicacions/2026-09-10_lavoz-memoria-cantada-es.pdf']
  ]) : new Map([
    ['La Voz de Galicia', '/documentos/publicacions/2026-09-09_xunta-alto-nivel-musica-coral-gl.pdf'],
    ['Xunta de Galicia', '/documentos/publicacions/2026-09-09_laopinion-bicentenario-adalid-gl.pdf'],
    ['La Opinión A Coruña', '/documentos/publicacions/2026-09-10_diariosantiago-oito-corais-gl.pdf'],
    ['Diario de Santiago', '/documentos/publicacions/2026-09-10_lavoz-memoria-cantada-gl.pdf']
  ]);

  const targetFor = (link) => {
    const text = (link?.textContent || '').trim();
    for (const [label, href] of targets) {
      if (text.includes(label)) return href;
    }
    return '';
  };

  const fixLink = (link) => {
    if (!(link instanceof HTMLAnchorElement)) return;
    const href = targetFor(link);
    if (href && link.getAttribute('href') !== href) link.setAttribute('href', href);
  };

  const fixLinks = () => {
    document.querySelectorAll('.actualidade-adalid-links a').forEach(fixLink);
  };

  const forceTarget = (event) => {
    const link = event.target instanceof Element
      ? event.target.closest('.actualidade-adalid-links a')
      : null;
    fixLink(link);
  };

  fixLinks();
  document.addEventListener('pointerdown', forceTarget, true);
  document.addEventListener('click', forceTarget, true);
  document.addEventListener('auxclick', forceTarget, true);
  document.addEventListener('focusin', forceTarget, true);

  const root = document.querySelector('.actualidade') || document.body;
  const observer = new MutationObserver(fixLinks);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
})();
