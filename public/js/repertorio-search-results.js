(() => {
  'use strict';

  const normalize = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  function setupSearchResults() {
    if (!window.location.pathname.startsWith('/portal/repertorio')) return;

    const search = document.querySelector('#work-search');
    const select = document.querySelector('#work-select');
    const controls = document.querySelector('.works-controls');

    if (!(search instanceof HTMLInputElement) ||
        !(select instanceof HTMLSelectElement) ||
        !(controls instanceof HTMLElement) ||
        document.querySelector('#work-search-results')) {
      return;
    }

    const results = document.createElement('div');
    results.id = 'work-search-results';
    results.className = 'work-search-results';
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', 'Resultados da busca');
    results.hidden = true;
    controls.insertAdjacentElement('afterend', results);

    const style = document.createElement('style');
    style.textContent = `
      .work-search-results[hidden] { display: none !important; }
      .work-search-results {
        display: grid;
        margin-top: .7rem;
        overflow: hidden;
        border: 1px solid #cfc6c1;
        border-radius: 4px;
        background: #fff;
        box-shadow: 0 8px 22px rgba(46, 34, 29, .06);
      }
      .work-search-feedback {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        padding: .62rem .82rem;
        border-bottom: 1px solid #e7e2de;
        background: #faf8f6;
        color: #5f5853;
        font-family: var(--fuente-minimalista, Aptos, Calibri, system-ui, sans-serif);
        font-size: .74rem;
      }
      .work-search-feedback strong {
        color: var(--color-principal, #6a1b29);
        font-size: .79rem;
      }
      .work-search-feedback span { color: #7a726d; }
      .work-search-result {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: .25rem 1rem;
        align-items: center;
        width: 100%;
        padding: .72rem .85rem;
        border: 0;
        border-bottom: 1px solid #e7e2de;
        background: #fff;
        color: #332f2c;
        font-family: var(--fuente-minimalista, Aptos, Calibri, system-ui, sans-serif);
        text-align: left;
        cursor: pointer;
      }
      .work-search-result:last-child { border-bottom: 0; }
      .work-search-result:hover,
      .work-search-result:focus-visible { background: #f7eff1; outline: none; }
      .work-search-result.is-single { background: #fbf6f7; box-shadow: inset 3px 0 var(--color-principal, #6a1b29); }
      .work-search-result strong {
        min-width: 0;
        color: var(--color-principal, #6a1b29);
        font-size: .88rem;
        font-weight: 700;
      }
      .work-search-result small { grid-column: 1; color: #6d6762; font-size: .72rem; }
      .work-search-open {
        grid-column: 2;
        grid-row: 1 / span 2;
        align-self: center;
        color: var(--color-principal, #6a1b29);
        font-size: .7rem;
        font-weight: 800;
        letter-spacing: .035em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      @media (max-width: 680px) {
        .work-search-feedback { align-items: flex-start; flex-direction: column; gap: .15rem; }
        .work-search-result { grid-template-columns: minmax(0, 1fr); }
        .work-search-open { grid-column: 1; grid-row: auto; margin-top: .18rem; }
      }
    `;
    document.head.append(style);

    const splitLabel = (label) => {
      const separator = label.indexOf(' — ');
      if (separator === -1) return { title: label, author: '' };
      return {
        title: label.slice(0, separator),
        author: label.slice(separator + 3)
      };
    };

    const render = () => {
      const query = normalize(search.value);
      results.replaceChildren();

      if (!query) {
        results.hidden = true;
        return;
      }

      const allMatches = Array.from(select.options)
        .filter((option) => option.value);
      const matches = allMatches.slice(0, 10);

      results.hidden = matches.length === 0;
      if (!matches.length) return;

      const feedback = document.createElement('div');
      feedback.className = 'work-search-feedback';
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');

      const feedbackStrong = document.createElement('strong');
      feedbackStrong.textContent = `${allMatches.length} obra${allMatches.length === 1 ? '' : 's'} atopada${allMatches.length === 1 ? '' : 's'}`;
      const feedbackHint = document.createElement('span');
      feedbackHint.textContent = allMatches.length === 1
        ? 'Preme na obra para abrir a súa ficha.'
        : 'Escolle unha das coincidencias.';
      feedback.append(feedbackStrong, feedbackHint);
      results.append(feedback);

      matches.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'work-search-result';
        button.classList.toggle('is-single', allMatches.length === 1);
        button.dataset.workId = option.value;
        button.setAttribute('role', 'option');

        const label = splitLabel(option.textContent || 'Obra');
        const title = document.createElement('strong');
        title.textContent = label.title;
        button.append(title);

        if (label.author) {
          const author = document.createElement('small');
          author.textContent = label.author;
          button.append(author);
        }

        const open = document.createElement('span');
        open.className = 'work-search-open';
        open.textContent = 'Abrir ficha';
        button.append(open);

        results.append(button);
      });
    };

    search.addEventListener('input', () => {
      window.setTimeout(render, 0);
    });

    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        results.hidden = true;
        return;
      }
      if (event.key === 'Enter') {
        const first = results.querySelector('.work-search-result');
        if (first instanceof HTMLButtonElement) {
          event.preventDefault();
          first.click();
        }
      }
    });

    results.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button[data-work-id]');
      if (!(button instanceof HTMLButtonElement)) return;

      const workId = button.dataset.workId || '';
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));

      window.setTimeout(() => {
        select.value = workId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        results.hidden = true;
      }, 0);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSearchResults, { once: true });
  } else {
    setupSearchResults();
  }
})();

(() => {
  if (!window.location.pathname.startsWith('/portal/ensaios')) return;
  const script = document.createElement('script');
  script.src = '/js/ensaios-obras.js';
  script.defer = true;
  document.head.append(script);
})();

(() => {
  'use strict';

  if (!/^\/portal\/concertos\/?$/.test(window.location.pathname)) return;

  const originalFetch = window.fetch.bind(window);
  const URL_CONCERTOS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSX8BEJ-hrubqEtaZ1zZaLSy7LoxaDQOuQuqR2ior7TZErtBGL5bJG0B_AK5Dp8eFeTDb3Pmpqh7Hnu/pub?gid=1098509641&single=true&output=csv';
  const URL_PROGRAMAS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTMm4Z45Bcfz_-AEwcA6lNmttLAjJEOxXpTFmlnLwtRCoSIF7xlCP-LEdlfLoMYkbOnAefC7I9G9Cec/pub?gid=1925601694&single=true&output=csv';
  const URL_REPERTORIO = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSuYtrIlKLbU1QkH7fP2zbKQQYFV6kvACLLFBZrJ7cC8t54jAsrTDWvL_x7fko9Hw71oKIoYyBcjNF3/pub?gid=984049442&single=true&output=csv';

  let idToken = '';
  let concertosPromise = null;

  const clean = (value = '') => String(value ?? '').trim();
  const normalize = (value = '') => clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  function bodyJson(init) {
    if (!init || typeof init.body !== 'string') return null;
    try {
      return JSON.parse(init.body);
    } catch {
      return null;
    }
  }

  function rememberToken(init) {
    const body = bodyJson(init);
    const token = clean(body?.idToken);
    if (token) idToken = token;
  }

  async function waitForToken() {
    if (idToken) return idToken;
    const start = Date.now();
    while (!idToken && Date.now() - start < 3500) {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    if (!idToken) throw new Error('Non se puido preparar a sesión para ler Concertos desde R2.');
    return idToken;
  }

  async function loadConcerts() {
    if (concertosPromise) return concertosPromise;
    concertosPromise = (async () => {
      const token = await waitForToken();
      const response = await originalFetch('/api/concertos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token, accion: 'listarConcertosPortal' })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true || !Array.isArray(result?.concertos)) {
        throw new Error(result?.erro || 'Non foi posible ler Concertos desde R2.');
      }
      return result.concertos;
    })().catch((error) => {
      concertosPromise = null;
      throw error;
    });
    return concertosPromise;
  }

  const csvCell = (value = '') => {
    const raw = clean(value);
    return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
  };

  const csv = (headers, rows) => [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
  ].join('\r\n');

  function concertsCsv(concerts) {
    const headers = [
      'Id', 'Data', 'Nome', 'Cidade', 'Lugar', 'Características', 'Cartel', 'Triptico',
      'Prensa', 'Hora', 'Mostrar_Web', 'Destacado_Web', 'Estado', 'NumeroConcerto',
      'OrdeHistorica', 'DataTextoHistorica'
    ];
    const rows = concerts.map((concert) => {
      const id = clean(concert.id);
      const historical = id.startsWith('hist-') || Boolean(clean(concert.numeroConcerto));
      const state = normalize(concert.estado);
      const visiblePrivate = !historical && ['previsto', 'confirmado', 'realizado'].includes(state);
      return {
        Id: id,
        Data: clean(concert.data),
        Nome: clean(concert.nome),
        Cidade: clean(concert.cidade),
        Lugar: clean(concert.lugar),
        'Características': clean(concert.caracteristicas),
        Cartel: clean(concert.cartel),
        Triptico: clean(concert.triptico),
        Prensa: clean(concert.prensa),
        Hora: clean(concert.hora),
        Mostrar_Web: visiblePrivate ? 'TRUE' : 'FALSE',
        Destacado_Web: concert.destacadoWeb === true ? 'TRUE' : 'FALSE',
        Estado: clean(concert.estado),
        NumeroConcerto: clean(concert.numeroConcerto),
        OrdeHistorica: clean(concert.ordeHistorica),
        DataTextoHistorica: clean(concert.dataTextoHistorica)
      };
    });
    return csv(headers, rows);
  }

  function programsCsv(concerts) {
    const headers = ['Id', 'Orde', 'Notas', 'Solista', 'Id_Conciertos', 'Id_Obras'];
    const rows = [];
    let rowId = 1;
    concerts.forEach((concert) => {
      (Array.isArray(concert.programa) ? concert.programa : []).forEach((item, index) => {
        rows.push({
          Id: `r2-${rowId++}`,
          Orde: clean(item.orde || index + 1),
          Notas: clean(item.notas),
          Solista: clean(item.solista),
          Id_Conciertos: clean(concert.id),
          Id_Obras: clean(item.id)
        });
      });
    });
    return csv(headers, rows);
  }

  function repertoireCsv(concerts) {
    const headers = ['Id', 'NomeObra', 'Compositor'];
    const works = new Map();
    concerts.forEach((concert) => {
      (Array.isArray(concert.programa) ? concert.programa : []).forEach((item) => {
        const id = clean(item.id);
        if (!id || works.has(id)) return;
        works.set(id, {
          Id: id,
          NomeObra: clean(item.obra) || id,
          Compositor: clean(item.autor)
        });
      });
    });
    return csv(headers, [...works.values()]);
  }

  const csvResponse = (text) => new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-SCPP-Concertos-Source': 'R2-PRIVATE'
    }
  });

  window.fetch = async (input, init) => {
    rememberToken(init);
    const url = typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : String(input);

    if (url === URL_CONCERTOS || url === URL_PROGRAMAS || url === URL_REPERTORIO) {
      const concerts = await loadConcerts();
      if (url === URL_CONCERTOS) return csvResponse(concertsCsv(concerts));
      if (url === URL_PROGRAMAS) return csvResponse(programsCsv(concerts));
      return csvResponse(repertoireCsv(concerts));
    }

    return originalFetch(input, init);
  };
})();