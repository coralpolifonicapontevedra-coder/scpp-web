(() => {
  if (!document.querySelector('link[data-history-parity-es]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/css/historia-paridad-es.css?v=20260907-2';
    stylesheet.dataset.historyParityEs = 'true';
    document.head.append(stylesheet);
  }

  const page = document.querySelector('.historia-page');
  if (!(page instanceof HTMLElement)) return;

  const tabDescriptions = {
    origenes: 'El nacimiento de una institución musical y cultural singular.',
    cronologia: 'Un siglo de conciertos, viajes, encuentros y continuidad.',
    direccion: 'Las personas que construyeron y renovaron la identidad sonora de la Coral.',
    presidencias: 'La continuidad organizativa de una entidad centenaria.',
    castelao: 'Una identidad visual inseparable de la historia de la Polifónica.',
    legado: 'Repertorio, grabaciones, archivo y memoria compartida.',
    historico: 'Consulta por décadas los conciertos documentados y programas de mano.'
  };

  page.querySelectorAll('.archive-tab').forEach((tab) => {
    if (!(tab instanceof HTMLElement)) return;
    const key = tab.dataset.tab || '';
    if (!key || tab.querySelector('small')) return;
    const description = tabDescriptions[key];
    if (!description) return;
    const small = document.createElement('small');
    small.textContent = description;
    tab.append(small);
  });

  const directors = [
    {
      nombre: 'Antonio Blanco Porto',
      periodo: '1925 — 1940',
      resumen: 'Director fundador y principal artífice de la primera identidad sonora de la Coral.',
      texto: 'Dotó a la agrupación de una disciplina interpretativa excepcional y construyó un repertorio en el que convivían la polifonía europea, la música sacra y las armonizaciones del canto popular gallego. Durante su etapa llegaron los primeros grandes éxitos en Galicia, Madrid y Portugal.',
      aportacion: 'Vinculado a la armonización y difusión del repertorio gallego, entre otras piezas conservadas por la entidad.'
    },
    {
      nombre: 'Antonio Iglesias Vilarelle',
      periodo: '1940 — 1964',
      resumen: 'Compositor, musicólogo y continuador de la etapa fundacional.',
      texto: 'Asumió la dirección tras el fallecimiento de Antonio Blanco Porto. Durante más de dos décadas dio continuidad al estilo de la agrupación, amplió el repertorio y mantuvo la presencia de la Sociedad en la vida musical gallega.',
      aportacion: 'Autor y armonizador de obras muy presentes en la tradición interpretativa de la Polifónica.'
    },
    {
      nombre: 'Manuel Fernández Cayeiro',
      periodo: '1964 — 1967',
      resumen: 'Primera etapa al frente de la dirección musical de la Sociedad.',
      texto: 'Asumió por primera vez la dirección de la Coral en 1964, iniciando una relación con la entidad que tendría continuidad décadas más tarde. En esta primera etapa contribuyó a mantener el nivel artístico y la continuidad del repertorio histórico.',
      aportacion: 'Su vinculación con la Polifónica se desarrolló en dos etapas diferenciadas.'
    },
    {
      nombre: 'Agustín Bertomeu Salazar',
      periodo: '1968 — 1977',
      resumen: 'Músico y compositor con una aportación propia al repertorio de la Coral.',
      texto: 'Dirigió la Sociedad durante una etapa de intensa actividad musical. Su relación con la Polifónica dejó una memoria especialmente ligada al trabajo con los cantores y a la incorporación de creaciones propias al repertorio.',
      aportacion: 'Entre sus composiciones vinculadas a la Coral figura el romance Ábreme a portiña.'
    },
    {
      nombre: 'José Antonio Sánchez Rodríguez «Pachú»',
      periodo: '1977 — 1980',
      resumen: 'Director de una etapa breve de transición y continuidad artística.',
      texto: 'Asumió la dirección musical en la segunda mitad de la década de 1970 y mantuvo la actividad de la agrupación hasta el relevo de José Verea Montero en 1980.',
      aportacion: 'Su etapa garantizó la continuidad del trabajo coral entre dos direcciones prolongadas.'
    },
    {
      nombre: 'José Verea Montero',
      periodo: '1980 — 1998',
      resumen: 'Responsable de una larga etapa de estabilidad y renovación coral.',
      texto: 'Tomó el relevo en mayo de 1980 y guio a la agrupación durante casi dos décadas. Bajo su dirección continuaron las actuaciones en Galicia, en el resto de España y en el extranjero, manteniendo el equilibrio entre legado histórico y renovación musical.',
      aportacion: 'Compositor de obras interpretadas y grabadas por la Sociedad.'
    },
    {
      nombre: 'Manuel Fernández Cayeiro',
      periodo: '1998 — 2008',
      resumen: 'Segunda etapa al frente de la Coral.',
      texto: 'Regresó a la dirección en octubre de 1998. En esta segunda etapa condujo la agrupación durante la celebración del 75 aniversario, la recuperación de grabaciones históricas y una intensa actividad concertística.',
      aportacion: 'Su segunda etapa contribuyó a preservar el repertorio tradicional y a incorporar nuevas propuestas.'
    },
    {
      nombre: 'Marlene Armentero Cutiño',
      periodo: '2008 — 2013',
      resumen: 'Primera mujer en asumir la dirección musical de la Sociedad.',
      texto: 'Dirigió la agrupación durante una etapa de continuidad y renovación, manteniendo la presencia habitual de la Coral en conciertos, actos institucionales y celebraciones litúrgicas.',
      aportacion: 'Su dirección abrió una nueva etapa en la historia artística de la Polifónica.'
    },
    {
      nombre: 'Nanette Sánchez Ordaz',
      periodo: '2013 — actualidad',
      resumen: 'Directora de la etapa contemporánea y del centenario.',
      texto: 'Desde 2013 conduce la actividad musical de la Sociedad. Bajo su dirección, la Coral renovó repertorios, participó en proyectos de colaboración y afrontó la programación del centenario, manteniendo la identidad histórica de la entidad abierta a nuevos lenguajes y escenarios.',
      aportacion: 'Su etapa combina recuperación patrimonial, repertorio contemporáneo y nuevas colaboraciones.',
      enlace: '/es/directora'
    }
  ];

  const directionPanel = page.querySelector('#panel-direccion');
  const peopleList = directionPanel?.querySelector('.people-list');
  if (peopleList instanceof HTMLElement) {
    peopleList.replaceChildren();
    directors.forEach((director, index) => {
      const article = document.createElement('article');
      article.className = 'person-card';

      const personIndex = document.createElement('div');
      personIndex.className = 'person-index';
      personIndex.textContent = String(index + 1).padStart(2, '0');

      const main = document.createElement('div');
      main.className = 'person-main';

      const period = document.createElement('p');
      period.className = 'person-period';
      period.textContent = director.periodo;

      const title = document.createElement('h3');
      if (director.enlace) {
        const link = document.createElement('a');
        link.href = director.enlace;
        link.className = 'director-link';
        link.textContent = director.nombre;
        title.append(link);
      } else {
        title.textContent = director.nombre;
      }

      const summary = document.createElement('p');
      summary.className = 'person-summary';
      summary.textContent = director.resumen;

      const text = document.createElement('p');
      text.textContent = director.texto;

      const work = document.createElement('p');
      work.className = 'person-work';
      const strong = document.createElement('strong');
      strong.textContent = 'Aportación: ';
      work.append(strong, director.aportacion);

      main.append(period, title, summary, text, work);
      article.append(personIndex, main);
      peopleList.append(article);
    });
  }

  const presidents = [
    {
      nombre: 'Antón Losada Diéguez',
      periodo: '1925 — 1929',
      texto: 'Primer presidente y una de las personas decisivas en el impulso cultural e institucional de la Sociedad. Formó parte también de la cuerda de barítonos.',
      foto: {
        src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2F288c578f-7316-565a-b573-160a866fc0eb.jpg',
        alt: 'Retrato de Antón Losada Diéguez, primer presidente de la Sociedad Coral Polifónica de Pontevedra',
        credito: 'Museo de Pontevedra · Archivo de la SCPP'
      }
    },
    {
      nombre: 'Alfonso Daniel Rodríguez Castelao',
      periodo: '1929 — 1932',
      texto: 'Presidente, cantor bajo, escenógrafo y creador de la identidad visual de la Coral. Su huella artística continúa formando parte de la imagen de la entidad.',
      foto: {
        src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Castelao%20Vida%20Gallega%20442.png',
        alt: 'Retrato de Alfonso Daniel Rodríguez Castelao publicado en Vida Gallega en 1930',
        credito: 'Vida Gallega · Galiciana / Wikimedia Commons · dominio público',
        fuente: 'https://commons.wikimedia.org/wiki/File:Castelao_Vida_Gallega_442.png'
      }
    },
    {
      nombre: 'José Blein Llinás',
      periodo: '1932 — 1947',
      texto: 'Asumió la presidencia en un periodo complejo de la historia de Galicia y dio continuidad a la estructura institucional de la Sociedad.',
      foto: {
        src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2F991becc5-ce34-514b-b2d3-1bc1fe090377.jpg',
        alt: 'Retrato de José Blein Llinás en la década de 1930',
        credito: 'Museo de Pontevedra · Archivo de la SCPP'
      }
    },
    {
      nombre: 'Vicente Riestra Calderón',
      periodo: '1947 — 1967',
      texto: 'Presidió la Sociedad durante dos décadas, sosteniendo su continuidad organizativa y la actividad pública de la agrupación.',
      foto: {
        src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Riestra%20Calder%C3%B3n%2C%20Enrique%20Peinador%2C%20Valle-Incl%C3%A1n%2C%20Ram%C3%B3n%20Cabanillas%20e%20Victoriano%20Garc%C3%ADa%20Mart%C3%AD.jpg',
        alt: 'Vicente Riestra Calderón en una fotografía de grupo en el Balneario de Mondariz, primero por la izquierda',
        credito: 'Wikimedia Commons · dominio público',
        fuente: 'https://commons.wikimedia.org/wiki/File:Riestra_Calder%C3%B3n,_Enrique_Peinador,_Valle-Incl%C3%A1n,_Ram%C3%B3n_Cabanillas_e_Victoriano_Garc%C3%ADa_Mart%C3%AD.jpg'
      }
    },
    {
      nombre: 'Augusto García Sánchez',
      periodo: '1967 — 1978',
      texto: 'Dio continuidad a la vida institucional de la Coral en una etapa de transformación social y renovación de la actividad musical.',
      foto: {
        src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fpresidencia-augusto-garcia-sanchez.jpg',
        alt: 'Fotografía de Augusto García Sánchez, presidente de la Sociedad Coral Polifónica de Pontevedra',
        credito: 'Archivo de la SCPP · Presidencias'
      }
    },
    {
      nombre: 'José Fernando Filgueira Valverde',
      periodo: '1978 — 1996',
      texto: 'Intelectual, investigador y director del Museo de Pontevedra, mantuvo estrechamente unidas ambas instituciones y reforzó la dimensión cultural y patrimonial de la Coral.',
      foto: {
        src: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Xos%C3%A9%20Filgueira%20Valverde%2C%201931.jpg',
        alt: 'Retrato de Xosé Filgueira Valverde en 1931',
        credito: 'Fundación Filgueira / Wikimedia Commons · dominio público',
        fuente: 'https://commons.wikimedia.org/wiki/File:Xos%C3%A9_Filgueira_Valverde,_1931.jpg'
      }
    },
    {
      nombre: 'Xosé Carlos Valle Pérez',
      periodo: '1996 — 2026',
      texto: 'Presidió la Sociedad durante casi treinta años. Su etapa abarcó el 75 aniversario, una intensa actividad institucional y la preparación y celebración del centenario.',
      foto: {
        src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fpresidencia-xose-carlos-valle-perez.jpg',
        alt: 'Fotografía de Xosé Carlos Valle Pérez, presidente de la Sociedad Coral Polifónica de Pontevedra',
        credito: 'Archivo de la SCPP · Presidencias'
      }
    },
    {
      nombre: 'José Raposeiras Correa',
      periodo: '2026 — actualidad',
      texto: 'Presidente de la nueva etapa posterior al centenario, orientada a la continuidad artística, a la conservación de la memoria y a la apertura de nuevos proyectos.',
      foto: {
        src: '/api/galeria-orixinal?ruta=fotos%2Forixinais%2Fpresidencia-jose-raposeiras-correa.jpg',
        alt: 'Fotografía de José Raposeiras Correa, presidente de la Sociedad Coral Polifónica de Pontevedra',
        credito: 'Archivo de la SCPP · Presidencias'
      }
    }
  ];

  const presidencyPanel = page.querySelector('#panel-presidencias');
  const presidencyGrid = presidencyPanel?.querySelector('.presidency-grid');
  if (presidencyGrid instanceof HTMLElement) {
    presidencyGrid.replaceChildren();
    presidents.forEach((president) => {
      const article = document.createElement('article');
      article.className = 'presidency-card';

      const figure = document.createElement('figure');
      figure.className = 'presidency-photo';

      const image = document.createElement('img');
      image.src = president.foto.src;
      image.alt = president.foto.alt;
      image.loading = 'lazy';
      image.decoding = 'async';
      figure.append(image);

      const caption = document.createElement('figcaption');
      if (president.foto.fuente) {
        const link = document.createElement('a');
        link.href = president.foto.fuente;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = president.foto.credito;
        caption.append(link);
      } else {
        caption.textContent = president.foto.credito;
      }
      figure.append(caption);

      const period = document.createElement('span');
      period.textContent = president.periodo;
      const title = document.createElement('h3');
      title.textContent = president.nombre;
      const text = document.createElement('p');
      text.textContent = president.texto;

      article.append(figure, period, title, text);
      presidencyGrid.append(article);
    });
  }

  const chronologyPanel = page.querySelector('#panel-cronologia');
  if (chronologyPanel instanceof HTMLElement) {
    const cards = [...chronologyPanel.querySelectorAll('.chronology-card')];
    const card2025 = cards.find((card) => card.querySelector('.chronology-year')?.textContent?.trim() === '2025');
    const paragraph = card2025?.querySelector('p');
    if (paragraph) {
      paragraph.textContent = 'El programa conmemorativo tuvo tres citas musicales especialmente significativas: el concierto del 9 de abril en la iglesia de San Francisco, cien años después de la primera actuación pública; el homenaje organizado por la Sociedad Filarmónica de Pontevedra el 2 de junio en el Teatro Principal; y el concierto de Navidad del 20 de diciembre en San Francisco, compartido con la Banda de Música de Pontevedra, con un programa que incluyó la Missa Brevis de Jacob de Haan y una selección de villancicos.';
    }
  }

  const legacyPanel = page.querySelector('#panel-legado');
  if (legacyPanel instanceof HTMLElement && !legacyPanel.querySelector('.closing-statement')) {
    const heading = legacyPanel.querySelector('.section-heading');
    if (heading instanceof HTMLElement) {
      const description = heading.querySelector('p:last-child');
      if (!description || description.classList.contains('section-kicker')) {
        const p = document.createElement('p');
        p.textContent = 'El legado de la Sociedad es musical, artístico, documental y humano. No es un patrimonio inmóvil: continúa creciendo con cada concierto, cada incorporación y cada nueva lectura de su historia.';
        heading.append(p);
      }
    }

    const closing = document.createElement('div');
    closing.className = 'closing-statement';
    closing.innerHTML = '<p class="section-kicker">Desde 1925</p><h2>Una historia que continúa cantándose</h2><p>La Sociedad Coral Polifónica de Pontevedra llega a su segundo siglo fiel a su memoria y consciente de que toda tradición solo permanece viva cuando es capaz de dialogar con el presente.</p>';
    legacyPanel.append(closing);
  }
})();