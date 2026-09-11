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

  const fixLinks = () => {
    const links = document.querySelectorAll('.actualidade-adalid-links a');
    if (!links.length) return false;

    links.forEach((link) => {
      const text = (link.textContent || '').trim();
      for (const [label, href] of targets) {
        if (text.includes(label)) {
          link.setAttribute('href', href);
          break;
        }
      }
    });
    return true;
  };

  if (fixLinks()) return;

  const root = document.querySelector('.actualidade') || document.body;
  const observer = new MutationObserver(() => {
    if (fixLinks()) observer.disconnect();
  });
  observer.observe(root, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000);
})();
