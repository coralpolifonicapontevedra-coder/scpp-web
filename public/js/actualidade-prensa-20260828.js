(() => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isEs = path === '/es/actualidad';
  const isGl = path === '/actualidade' || path === '/gl/actualidade';
  if (!isGl && !isEs) return;

  const TITULO_GL = 'A Polifónica abre o curso 2026/2027 e busca novas voces';
  const TITULO_ES = 'La Polifónica abre el curso 2026/2027 y busca nuevas voces';

  const pdfs = isEs
    ? [
        ['Ver noticia Faro de Vigo', '/documentos/publicacions/2026-08-28_faro-vigo-nuevos-talentos-es.pdf'],
        ['Ver noticia PontevedraViva', '/documentos/publicacions/2026-08-28_pontevedraviva-voces-masculinas-es.pdf']
      ]
    : [
        ['Ver noticia Faro de Vigo', '/documentos/publicacions/2026-08-28_faro-vigo-novos-talentos-gl.pdf'],
        ['Ver noticia PontevedraViva', '/documentos/publicacions/2026-08-28_pontevedraviva-voces-masculinas-gl.pdf']
      ];

  const ensureStyles = () => {
    if (document.getElementById('actualidade-prensa-20260828-style')) return;
    const style = document.createElement('style');
    style.id = 'actualidade-prensa-20260828-style';
    style.textContent = `
      .actualidade a,
      .actualidade a:visited,
      .actualidade a:hover,
      .actualidade a:focus-visible {
        color: #1f1f1f !important;
      }
      #publicacion-destacada h2 {
        font-size: clamp(1.35rem, 2.4vw, 2rem) !important;
        letter-spacing: -0.02em !important;
        line-height: 1.16 !important;
      }
      .actualidade-prensa-links {
        display: flex;
        flex-wrap: wrap;
        gap: 0.8rem 1.6rem;
        margin-top: 1.6rem;
      }
      .actualidade-prensa-links .ligazon-principal {
        color: #1f1f1f !important;
        border-bottom-color: #1f1f1f !important;
        margin-top: 0;
      }
      @media (max-width: 620px) {
        .actualidade-prensa-links { align-items: flex-start; flex-direction: column; }
      }
    `;
    document.head.append(style);
  };

  const apply = () => {
    ensureStyles();
    const section = document.getElementById('publicacion-destacada');
    const titleLink = document.getElementById('destacada-titulo-ligazon');
    const medium = document.getElementById('destacada-medio');
    const date = document.getElementById('destacada-data');
    const oldLink = document.getElementById('destacada-ligazon');
    if (!section || !titleLink || !medium || !date || section.hidden) return false;

    const dateValue = date.getAttribute('datetime') || '';
    const title = (titleLink.textContent || '').trim();
    const isTarget = dateValue === '2026-08-28' && (
      title === TITULO_GL || title === TITULO_ES ||
      title.includes('voces masculinas') || title.includes('novos talentos') ||
      title.includes('nuevos talentos') || title.includes('novas voces')
    );
    if (!isTarget) return false;

    titleLink.textContent = isEs ? TITULO_ES : TITULO_GL;
    titleLink.removeAttribute('href');
    titleLink.style.cursor = 'default';
    medium.textContent = 'Faro de Vigo · PontevedraViva';
    oldLink?.remove();

    let links = section.querySelector('.actualidade-prensa-links');
    if (!links) {
      links = document.createElement('div');
      links.className = 'actualidade-prensa-links';
      section.append(links);
    }

    links.replaceChildren(...pdfs.map(([label, href]) => {
      const a = document.createElement('a');
      a.className = 'ligazon-principal';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.append(document.createTextNode(`${label} `));
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      a.append(arrow);
      return a;
    }));

    return true;
  };

  if (apply()) return;
  const root = document.querySelector('.actualidade') || document.body;
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect();
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  window.setTimeout(() => observer.disconnect(), 10000);
})();
