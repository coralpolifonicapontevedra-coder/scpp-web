(() => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isEs = path === '/es/actualidad';
  const isGl = path === '/actualidade' || path === '/gl/actualidade';
  if (!isEs && !isGl) return;

  const pdfs = isEs ? [
    ['La Voz de Galicia','/documentos/publicacions/2026-09-10_lavoz-memoria-cantada-es.pdf'],
    ['Xunta de Galicia','/documentos/publicacions/2026-09-09_xunta-alto-nivel-musica-coral-es.pdf'],
    ['La Opinión A Coruña','/documentos/publicacions/2026-09-09_laopinion-bicentenario-adalid-es.pdf'],
    ['Diario de Santiago','/documentos/publicacions/2026-09-10_diariosantiago-oito-corais-es.pdf']
  ] : [
    ['La Voz de Galicia','/documentos/publicacions/2026-09-10_lavoz-memoria-cantada-gl.pdf'],
    ['Xunta de Galicia','/documentos/publicacions/2026-09-09_xunta-alto-nivel-musica-coral-gl.pdf'],
    ['La Opinión A Coruña','/documentos/publicacions/2026-09-09_laopinion-bicentenario-adalid-gl.pdf'],
    ['Diario de Santiago','/documentos/publicacions/2026-09-10_diariosantiago-oito-corais-gl.pdf']
  ];

  const title = isEs
    ? 'La Polifónica, en el tributo coral por el bicentenario de Marcial del Adalid'
    : 'A Polifónica, no tributo coral polo bicentenario de Marcial del Adalid';
  const summary = isEs
    ? 'La Sociedad Coral Polifónica de Pontevedra participó el 10 de septiembre en el Teatro Colón de A Coruña en el segundo de los conciertos organizados por la Real Academia Galega de Belas Artes para conmemorar el bicentenario del nacimiento de Marcial del Adalid. El encuentro reunió a ocho instituciones corales gallegas distinguidas con la medalla que lleva el nombre del compositor.'
    : 'A Sociedade Coral Polifónica de Pontevedra participou o 10 de setembro no Teatro Colón da Coruña no segundo dos concertos organizados pola Real Academia Galega de Belas Artes para conmemorar o bicentenario do nacemento de Marcial del Adalid. O encontro reuniu oito institucións corais galegas distinguidas coa medalla que leva o nome do compositor.';

  const addStyles = () => {
    if (document.getElementById('actualidade-adalid-20260910-style')) return;
    const s = document.createElement('style');
    s.id = 'actualidade-adalid-20260910-style';
    s.textContent = '.actualidade-adalid-resumo{max-width:850px;margin:1.4rem 0 0;color:#4f4a45;font-size:1.03rem;line-height:1.7}.actualidade-adalid-foto{margin:1.8rem 0 0;max-width:900px}.actualidade-adalid-foto img{display:block;width:100%;height:auto;max-height:560px;object-fit:cover}.actualidade-adalid-foto figcaption{margin-top:.55rem;color:#6b655f;font-size:.84rem}.actualidade-adalid-links{display:flex;flex-wrap:wrap;gap:.8rem 1.6rem;margin-top:1.6rem}.actualidade-adalid-links .ligazon-principal{margin-top:0;color:#1f1f1f!important;border-bottom-color:#1f1f1f!important}@media(max-width:620px){.actualidade-adalid-links{flex-direction:column;align-items:flex-start}}';
    document.head.append(s);
  };

  const apply = () => {
    const section = document.getElementById('publicacion-destacada');
    const titleLink = document.getElementById('destacada-titulo-ligazon');
    const medium = document.getElementById('destacada-medio');
    const date = document.getElementById('destacada-data');
    const oldLink = document.getElementById('destacada-ligazon');
    if (!section || !titleLink || !medium || !date || section.hidden) return false;
    if ((date.getAttribute('datetime') || '') !== '2026-09-10') return false;
    const current = (titleLink.textContent || '').toLowerCase();
    if (!current.includes('adalid') && !current.includes('memoria cantada')) return false;

    addStyles();
    titleLink.textContent = title;
    titleLink.removeAttribute('href');
    titleLink.style.cursor = 'default';
    medium.textContent = 'La Voz de Galicia · Xunta de Galicia · La Opinión A Coruña · Diario de Santiago';
    oldLink?.remove();

    if (!section.querySelector('.actualidade-adalid-resumo')) {
      const p = document.createElement('p');
      p.className = 'actualidade-adalid-resumo';
      p.textContent = summary;
      section.append(p);
    }
    if (!section.querySelector('.actualidade-adalid-foto')) {
      const fig = document.createElement('figure');
      fig.className = 'actualidade-adalid-foto';
      const img = document.createElement('img');
      img.src = '/api/galeria-orixinal?ruta=fotos%2Frevision-cache%2Ff3b24569-cf0e-4cbf-bf46-c221b7ada3e2.jpg';
      img.alt = isEs ? 'Sociedad Coral Polifónica de Pontevedra en el Teatro Colón de A Coruña' : 'Sociedade Coral Polifónica de Pontevedra no Teatro Colón da Coruña';
      const cap = document.createElement('figcaption');
      cap.textContent = isEs ? 'Sociedad Coral Polifónica de Pontevedra en el Teatro Colón de A Coruña, 10 de septiembre de 2026.' : 'Sociedade Coral Polifónica de Pontevedra no Teatro Colón da Coruña, 10 de setembro de 2026.';
      fig.append(img, cap);
      section.append(fig);
    }
    let links = section.querySelector('.actualidade-adalid-links');
    if (!links) { links = document.createElement('div'); links.className = 'actualidade-adalid-links'; section.append(links); }
    links.replaceChildren(...pdfs.map(([name,href]) => {
      const a = document.createElement('a');
      a.className = 'ligazon-principal'; a.href = href; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = `Ver noticia ${name} →`;
      return a;
    }));
    return true;
  };

  if (apply()) return;
  const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
  observer.observe(document.querySelector('.actualidade') || document.body, {childList:true,subtree:true,characterData:true,attributes:true});
  setTimeout(() => observer.disconnect(), 10000);
})();
