const PATH_CONCERTOS_CARDS = /^\/portal\/concertos\/?$/;

if (PATH_CONCERTOS_CARDS.test(window.location.pathname)) {
  const URL_CONCERTOS_CARDS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSX8BEJ-hrubqEtaZ1zZaLSy7LoxaDQOuQuqR2ior7TZErtBGL5bJG0B_AK5Dp8eFeTDb3Pmpqh7Hnu/pub?gid=1098509641&single=true&output=csv';
  const mediosConcertos = new Map();

  const normalizar = (valor = '') => String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  function parseCSV(texto) {
    const filas = [];
    let fila = [];
    let campo = '';
    let entreComillas = false;

    for (let indice = 0; indice < texto.length; indice += 1) {
      const caracter = texto[indice];
      const seguinte = texto[indice + 1];

      if (caracter === '"' && entreComillas && seguinte === '"') {
        campo += '"';
        indice += 1;
      } else if (caracter === '"') {
        entreComillas = !entreComillas;
      } else if (caracter === ',' && !entreComillas) {
        fila.push(campo);
        campo = '';
      } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
        if (caracter === '\r' && seguinte === '\n') indice += 1;
        fila.push(campo);
        if (fila.some((valor) => valor.trim() !== '')) filas.push(fila);
        fila = [];
        campo = '';
      } else {
        campo += caracter;
      }
    }

    if (campo || fila.length) {
      fila.push(campo);
      filas.push(fila);
    }

    const cabeceiras = (filas.shift() || []).map(normalizar);
    return filas.map((valores) => Object.fromEntries(
      cabeceiras.map((cabeceira, indice) => [cabeceira, (valores[indice] || '').trim()])
    ));
  }

  const valor = (fila, ...nomes) => {
    for (const nome of nomes) {
      const resultado = fila[normalizar(nome)];
      if (resultado !== undefined && resultado !== '') return resultado;
    }
    return '';
  };

  function urlCartel(ruta = '') {
    const nome = String(ruta)
      .replaceAll('\\', '/')
      .split('/')
      .filter(Boolean)
      .pop();

    if (!nome) return '';
    const miniatura = nome.replace(/\.pdf$/i, '.jpg');
    return `/img/concertos/${encodeURIComponent(miniatura)}`;
  }

  function decorarTarxeta(tarxeta) {
    if (!(tarxeta instanceof HTMLButtonElement)) return;
    if (tarxeta.dataset.documentCard === 'true') return;

    const id = tarxeta.dataset.id || '';
    const concerto = mediosConcertos.get(id);
    if (!concerto) return;

    tarxeta.dataset.documentCard = 'true';
    tarxeta.classList.add('concert-document-card');

    const parteInferior = tarxeta.querySelector('.square-bottom');
    if (parteInferior instanceof HTMLElement) {
      const textoObras = parteInferior.querySelector('span')?.textContent?.trim() || 'Ver información';
      parteInferior.replaceChildren();

      const recursos = document.createElement('span');
      recursos.className = 'concert-card-resources';

      const obras = document.createElement('span');
      obras.textContent = textoObras;
      recursos.append(obras);

      if (concerto.triptico) {
        const programa = document.createElement('span');
        programa.className = 'concert-card-program';
        programa.textContent = 'Programa de man';
        recursos.append(programa);
      }

      const abrir = document.createElement('span');
      abrir.className = 'concert-card-open';
      abrir.textContent = 'Ver concerto';

      parteInferior.append(recursos, abrir);
    }

    const posterUrl = urlCartel(concerto.cartel);
    if (!posterUrl) {
      tarxeta.classList.add('without-poster');
      return;
    }

    const poster = document.createElement('span');
    poster.className = 'concert-card-poster';

    const imaxe = document.createElement('img');
    imaxe.src = posterUrl;
    imaxe.alt = '';
    imaxe.loading = 'lazy';
    imaxe.decoding = 'async';
    imaxe.addEventListener('error', () => {
      poster.remove();
      tarxeta.classList.add('without-poster');
    }, { once: true });

    poster.append(imaxe);
    tarxeta.append(poster);
  }

  function decorarGrella() {
    document
      .querySelectorAll('#concert-grid button[data-id]')
      .forEach((tarxeta) => decorarTarxeta(tarxeta));
  }

  function engadirEstilos() {
    if (document.querySelector('#concert-document-card-styles')) return;

    const estilo = document.createElement('style');
    estilo.id = 'concert-document-card-styles';
    estilo.textContent = `
      #concert-grid.concert-grid {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 1rem !important;
        align-items: stretch !important;
      }

      #concert-grid .concert-square.concert-document-card {
        position: relative !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) 128px !important;
        grid-template-areas:
          "top poster"
          "date poster"
          "copy poster"
          "bottom bottom" !important;
        grid-template-rows: auto auto 1fr auto !important;
        column-gap: 1.25rem !important;
        row-gap: 0 !important;
        width: 100% !important;
        min-height: 270px !important;
        aspect-ratio: auto !important;
        padding: 1.45rem 1.35rem 1.1rem 1.45rem !important;
        overflow: hidden !important;
        border: 1px solid #ddd5d0 !important;
        border-left: 4px solid var(--color-principal) !important;
        border-radius: 0 !important;
        background: #fff !important;
        box-shadow: 0 10px 28px rgba(55, 40, 34, .045) !important;
        color: #34302d !important;
        text-align: left !important;
      }

      #concert-grid .concert-square.concert-document-card:hover,
      #concert-grid .concert-square.concert-document-card:focus-visible {
        transform: translateY(-2px) !important;
        border-color: #cbbfb8 !important;
        border-left-color: var(--color-principal) !important;
        box-shadow: 0 14px 32px rgba(55, 40, 34, .09) !important;
        outline: none !important;
      }

      #concert-grid .concert-document-card.is-past {
        background: #fff !important;
      }

      #concert-grid .concert-document-card .square-top {
        grid-area: top;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: .75rem !important;
        width: 100% !important;
        margin: 0 0 .8rem !important;
      }

      #concert-grid .concert-document-card .square-state {
        color: var(--color-principal) !important;
        font-size: .68rem !important;
        font-weight: 800 !important;
        letter-spacing: .1em !important;
        text-transform: uppercase !important;
      }

      #concert-grid .concert-document-card .square-year {
        color: #a18331 !important;
        font-size: .72rem !important;
        font-weight: 750 !important;
      }

      #concert-grid .concert-document-card .square-date {
        grid-area: date;
        display: flex !important;
        align-items: baseline !important;
        gap: .48rem !important;
        margin: 0 0 .55rem !important;
        color: #a18331 !important;
      }

      #concert-grid .concert-document-card .square-date strong {
        font-size: 1.42rem !important;
        font-weight: 600 !important;
        line-height: 1 !important;
      }

      #concert-grid .concert-document-card .square-date span {
        font-size: .73rem !important;
        font-weight: 800 !important;
        letter-spacing: .04em !important;
      }

      #concert-grid .concert-document-card .square-copy {
        grid-area: copy;
        display: grid !important;
        align-content: start !important;
        gap: .55rem !important;
        width: 100% !important;
        padding-right: .2rem !important;
      }

      #concert-grid .concert-document-card .square-copy strong {
        color: #292522 !important;
        font-size: 1.08rem !important;
        font-weight: 750 !important;
        line-height: 1.32 !important;
      }

      #concert-grid .concert-document-card .square-copy span {
        color: #6f6863 !important;
        font-size: .78rem !important;
        line-height: 1.45 !important;
      }

      #concert-grid .concert-document-card .concert-card-poster {
        grid-area: poster;
        display: grid !important;
        width: 128px !important;
        height: 176px !important;
        place-items: center !important;
        align-self: start !important;
        overflow: hidden !important;
        border: 1px solid #ddd6d1 !important;
        background: #f5f2ef !important;
      }

      #concert-grid .concert-document-card .concert-card-poster img {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important;
      }

      #concert-grid .concert-document-card .square-bottom {
        grid-area: bottom;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 1rem !important;
        width: 100% !important;
        margin: 1.05rem 0 0 !important;
        padding: .95rem 0 0 !important;
        border-top: 1px solid #e2ddd9 !important;
        color: inherit !important;
      }

      #concert-grid .concert-document-card .concert-card-resources {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: .4rem .8rem !important;
        color: #6e6762 !important;
        font-size: .7rem !important;
        font-weight: 600 !important;
      }

      #concert-grid .concert-document-card .concert-card-program {
        color: var(--color-principal) !important;
        font-weight: 750 !important;
      }

      #concert-grid .concert-document-card .concert-card-open {
        flex: 0 0 auto !important;
        min-width: 104px !important;
        padding: .55rem .78rem !important;
        background: var(--color-principal) !important;
        color: #fff !important;
        font-size: .72rem !important;
        font-weight: 800 !important;
        text-align: center !important;
      }

      #concert-grid .concert-document-card.without-poster {
        grid-template-columns: 1fr !important;
        grid-template-areas:
          "top"
          "date"
          "copy"
          "bottom" !important;
      }

      @media (max-width: 1050px) {
        #concert-grid.concert-grid {
          grid-template-columns: 1fr !important;
        }
      }

      @media (max-width: 620px) {
        #concert-grid .concert-square.concert-document-card {
          grid-template-columns: minmax(0, 1fr) 92px !important;
          column-gap: .85rem !important;
          min-height: 235px !important;
          padding: 1.1rem 1rem .95rem 1.05rem !important;
        }

        #concert-grid .concert-document-card .concert-card-poster {
          width: 92px !important;
          height: 132px !important;
        }

        #concert-grid .concert-document-card .square-copy strong {
          font-size: .96rem !important;
        }

        #concert-grid .concert-document-card .square-bottom {
          align-items: stretch !important;
          flex-direction: column !important;
        }

        #concert-grid .concert-document-card .concert-card-open {
          width: 100% !important;
        }
      }
    `;
    document.head.append(estilo);
  }

  async function cargarMedios() {
    const resposta = await fetch(URL_CONCERTOS_CARDS, { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`Erro ${resposta.status}`);

    const filas = parseCSV(await resposta.text());
    filas.forEach((fila) => {
      const id = valor(fila, 'Id', 'Row ID');
      if (!id) return;
      mediosConcertos.set(id, {
        cartel: valor(fila, 'Cartel'),
        triptico: valor(fila, 'Triptico', 'Tríptico')
      });
    });

    decorarGrella();
  }

  function iniciarTarxetas() {
    engadirEstilos();

    const grella = document.querySelector('#concert-grid');
    if (grella instanceof HTMLElement) {
      const observador = new MutationObserver(decorarGrella);
      observador.observe(grella, { childList: true });
    }

    cargarMedios().catch((erro) => {
      console.error('Non se puideron preparar as tarxetas de concertos:', erro);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarTarxetas, { once: true });
  } else {
    iniciarTarxetas();
  }
}
