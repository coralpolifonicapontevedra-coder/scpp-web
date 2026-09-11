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
    ? 'La Polifónica, presente en el homenaje coral por el bicentenario de Marcial del Adalid'
    : 'A Polifónica, presente na homenaxe coral polo bicentenario de Marcial del Adalid';

  const paragraphs = isEs ? [
    'La Sociedad Coral Polifónica de Pontevedra participó en el concierto celebrado el 10 de septiembre en el Teatro Colón de A Coruña con motivo del bicentenario del compositor Marcial del Adalid, dentro del programa organizado por la Real Academia Galega de Belas Artes.',
    'La celebración reunió a ocho instituciones corales distinguidas con la Medalla Marcial del Adalid y sirvió para poner en valor la vigencia de la música coral gallega y la memoria de uno de los grandes nombres de nuestra creación musical. En la segunda jornada, la Sociedad Coral Polifónica de Pontevedra compartió programa con De Ruada, Cántigas da Terra y Follas Novas.',
    'Reunimos aquí, en una única publicación, las referencias aparecidas en La Voz de Galicia, la Xunta de Galicia, La Opinión A Coruña y Diario de Santiago, junto con sus fichas documentales en PDF para consulta y archivo.'
  ] : [
    'A Sociedade Coral Polifónica de Pontevedra participou no concerto celebrado o 10 de setembro no Teatro Colón da Coruña con motivo do bicentenario do compositor Marcial del Adalid, dentro do programa organizado pola Real Academia Galega de Belas Artes.',
    'A celebración reuniu oito institucións corais distinguidas coa Medalla Marcial del Adalid e serviu para poñer en valor a vixencia da música coral galega e a memoria dun dos grandes nomes da nosa creación musical. Na segunda xornada, a Sociedade Coral Polifónica de Pontevedra compartiu programa con De Ruada, Cántigas da Terra e Follas Novas.',
    'Reunimos aquí, nunha única publicación, as referencias aparecidas en La Voz de Galicia, a Xunta de Galicia, La Opinión A Coruña e Diario de Santiago, xunto coas súas fichas documentais en PDF para consulta e arquivo.'
  ];

  const photoUrl = '/api/galeria-orixinal?ruta=fotos%2Frevision-cache%2Ff3b24569-cf0e-4cbf-bf46-c221b7ada3e2.jpg';

  const addStyles = () => {
    if (document.getElementById('actualidade-adalid-20260910-style')) return;
    const s = document.createElement('style');
    s.id = 'actualidade-adalid-20260910-style';
    s.textContent = `
      .actualidade-adalid-corpo{margin-top:1.55rem;max-width:1000px;color:#4f4a45;font-size:1.03rem;line-height:1.72}
      .actualidade-adalid-corpo::after{content:"";display:block;clear:both}
      .actualidade-adalid-foto{float:left;width:180px;max-width:28%;margin:.18rem 1.35rem .75rem 0;text-decoration:none;color:inherit}
      .actualidade-adalid-foto img{display:block;width:100%;height:auto;max-height:210px;object-fit:cover;border-radius:3px}
      .actualidade-adalid-foto span{display:block;margin-top:.38rem;color:#6b655f;font-size:.74rem;line-height:1.3}
      .actualidade-adalid-corpo p{margin:0 0 .95rem}
      .actualidade-adalid-links{clear:both;display:flex;flex-wrap:wrap;gap:.8rem 1.6rem;margin-top:1.35rem}
      .actualidade-adalid-links .ligazon-principal{margin-top:0;color:#1f1f1f!important;border-bottom-color:#1f1f1f!important}
      @media(max-width:700px){
        .actualidade-adalid-foto{float:left;width:130px;max-width:42%;margin:.15rem 1rem .65rem 0}
        .actualidade-adalid-foto img{max-height:165px}
        .actualidade-adalid-links{flex-direction:column;align-items:flex-start}
      }
      @media(max-width:430px){
        .actualidade-adalid-foto{float:none;width:170px;max-width:100%;margin:.15rem 0 .9rem}
      }
    `;
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

    section.querySelector('.actualidade-adalid-resumo')?.remove();
    section.querySelector('.actualidade-adalid-foto')?.remove();

    let body = section.querySelector('.actualidade-adalid-corpo');
    if (!body) {
      body = document.createElement('div');
      body.className = 'actualidade-adalid-corpo';
      section.append(body);
    }

    body.replaceChildren();

    const photo = document.createElement('a');
    photo.className = 'actualidade-adalid-foto';
    photo.href = photoUrl;
    photo.target = '_blank';
    photo.rel = 'noopener';
    photo.setAttribute('aria-label', isEs ? 'Abrir fotografía en tamaño original' : 'Abrir fotografía en tamaño orixinal');

    const img = document.createElement('img');
    img.src = photoUrl;
    img.alt = isEs
      ? 'Sociedad Coral Polifónica de Pontevedra en el Teatro Colón de A Coruña'
      : 'Sociedade Coral Polifónica de Pontevedra no Teatro Colón da Coruña';
    img.loading = 'lazy';

    const caption = document.createElement('span');
    caption.textContent = isEs
      ? 'Teatro Colón, 10 de septiembre de 2026. Pulse para ampliar.'
      : 'Teatro Colón, 10 de setembro de 2026. Prema para ampliar.';

    photo.append(img, caption);
    body.append(photo);

    paragraphs.forEach((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      body.append(p);
    });

    let links = section.querySelector('.actualidade-adalid-links');
    if (!links) {
      links = document.createElement('div');
      links.className = 'actualidade-adalid-links';
      section.append(links);
    }
    links.replaceChildren(...pdfs.map(([name, href]) => {
      const a = document.createElement('a');
      a.className = 'ligazon-principal';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `Ver ficha ${name} →`;
      return a;
    }));
    return true;
  };

  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect();
  });
  observer.observe(document.querySelector('.actualidade') || document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  });
  setTimeout(() => observer.disconnect(), 10000);
})();
