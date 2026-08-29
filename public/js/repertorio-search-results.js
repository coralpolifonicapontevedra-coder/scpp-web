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

  const loadScript = (src, marker) => {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute(marker, 'true');
    document.head.append(script);
  };

  loadScript('/js/ensaios-obras.js?v=20260828-5', 'data-ensaios-obras');

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/portal/ensaios/estudo') {
    loadScript('/js/ensaios-estudo-ui.js?v=20260828-4', 'data-ensaios-estudo-ui');
    loadScript('/js/ensaios-estudo-diagnostico.js?v=20260828-1', 'data-ensaios-estudo-diagnostico');
  }
})();

(() => {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== '/portal/administracion/persoas') return;

  const style = document.createElement('style');
  style.textContent = `
    .person-documents-status {
      display: grid;
      gap: .7rem;
      margin: 1rem 0 0;
      padding: 1rem;
      border: 1px solid #ded8d3;
      background: #faf9f7;
    }
    .person-documents-status h3 {
      margin: 0;
      color: var(--color-principal, #6b1d2f);
      font-size: 1rem;
    }
    .person-document-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: .75rem;
      align-items: center;
      padding-top: .65rem;
      border-top: 1px solid #e4ded9;
    }
    .person-document-row strong { display: block; font-size: .86rem; }
    .person-document-row small { display: block; margin-top: .1rem; color: #716963; }
    .person-document-row button {
      min-height: 2.35rem;
      padding: .45rem .75rem;
      border: 1px solid var(--color-principal, #6b1d2f);
      background: #fff;
      color: var(--color-principal, #6b1d2f);
      font: inherit;
      font-size: .78rem;
      font-weight: 800;
      cursor: pointer;
    }
    .person-document-row button[disabled] {
      border-color: #d7d0cb;
      color: #817a75;
      cursor: default;
    }

    @media (max-width: 900px) {
      body.portal-private-body main { width: 100%; min-width: 0; }
      body.portal-private-body .private-layout {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
      }
      body.portal-private-body .private-layout > .private-sidebar {
        position: relative !important;
        top: auto !important;
        width: 100% !important;
        max-width: none !important;
        height: auto !important;
        min-height: 0 !important;
        border-right: 0 !important;
        border-bottom: 1px solid #e7e3df !important;
      }
      body.portal-private-body .people-main {
        width: 100% !important;
        max-width: none !important;
        min-width: 0 !important;
        margin: 0 !important;
        padding: 1.1rem !important;
      }
      body.portal-private-body .private-page-header {
        grid-template-columns: 1fr !important;
        gap: 1rem !important;
      }
      body.portal-private-body .account-card { width: 100% !important; }
      body.portal-private-body .people-summary {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
      body.portal-private-body .people-summary > button {
        grid-column: 1 / -1 !important;
        width: 100% !important;
      }
      body.portal-private-body .filters-panel {
        grid-template-columns: 1fr 1fr !important;
      }
      body.portal-private-body .filters-panel .search-field { grid-column: 1 / -1 !important; }
      body.portal-private-body .toolbar {
        grid-template-columns: 1fr !important;
        gap: .5rem !important;
      }
      body.portal-private-body .toolbar > p { justify-self: start !important; }
      body.portal-private-body .person-card-header {
        grid-template-columns: 1fr !important;
        gap: 1rem !important;
      }
      body.portal-private-body .person-actions {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        width: 100% !important;
      }
      body.portal-private-body .person-actions button { width: 100% !important; }
    }

    @media (max-width: 620px) {
      body.portal-private-body .private-layout > .private-sidebar {
        padding: .7rem .8rem .8rem !important;
      }
      body.portal-private-body .private-brand {
        grid-template-columns: 38px minmax(0, 1fr) !important;
        gap: .65rem !important;
        padding: 0 .2rem .65rem !important;
      }
      body.portal-private-body .private-crest { width: 36px !important; height: 48px !important; }
      body.portal-private-body .private-brand-copy strong { font-size: .7rem !important; line-height: 1.25 !important; }
      body.portal-private-body .private-brand-copy small { font-size: .65rem !important; }
      body.portal-private-body .people-main { padding: .9rem .8rem 1.5rem !important; }
      body.portal-private-body .private-page-header h1 {
        font-size: clamp(2rem, 11vw, 2.75rem) !important;
        line-height: 1.02 !important;
      }
      body.portal-private-body .private-page-header > div:first-child > p {
        font-size: .92rem !important;
        line-height: 1.5 !important;
      }
      body.portal-private-body .people-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: .65rem !important;
      }
      body.portal-private-body .people-summary > div { min-width: 0 !important; padding: .85rem !important; }
      body.portal-private-body .people-summary strong { font-size: 1.65rem !important; }
      body.portal-private-body .filters-panel { grid-template-columns: 1fr !important; }
      body.portal-private-body .filters-panel .search-field { grid-column: auto !important; }
      body.portal-private-body .person-actions { grid-template-columns: 1fr !important; }
      body.portal-private-body .person-sections { grid-template-columns: 1fr !important; }
      .person-document-row { grid-template-columns: 1fr !important; }
      .person-document-row button { width: 100% !important; }
    }
  `;
  document.head.append(style);

  const select = document.querySelector('#person-select');
  const card = document.querySelector('#person-card');
  const sections = document.querySelector('#person-sections');
  const fileButton = document.querySelector('#open-file');
  const acceptanceButton = document.querySelector('#open-acceptance');
  if (!(select instanceof HTMLSelectElement) || !(card instanceof HTMLElement) || !(sections instanceof HTMLElement)) return;

  const box = document.createElement('section');
  box.className = 'person-documents-status';
  box.hidden = true;
  const title = document.createElement('h3');
  title.textContent = 'Documentación da persoa';

  const makeRow = (label) => {
    const row = document.createElement('div');
    row.className = 'person-document-row';
    const copy = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = label;
    const status = document.createElement('small');
    copy.append(strong, status);
    const button = document.createElement('button');
    button.type = 'button';
    row.append(copy, button);
    return { row, status, button };
  };

  const ficha = makeRow('Ficha escaneada');
  const aceptacion = makeRow('Aceptación PDF');
  box.append(title, ficha.row, aceptacion.row);
  sections.insertAdjacentElement('beforebegin', box);

  ficha.button.addEventListener('click', () => {
    if (fileButton instanceof HTMLButtonElement && !fileButton.hidden) fileButton.click();
  });
  aceptacion.button.addEventListener('click', () => {
    if (acceptanceButton instanceof HTMLButtonElement && !acceptanceButton.hidden) acceptanceButton.click();
  });

  const sync = () => {
    const hasSelection = Boolean(select.value) && !card.hidden;
    box.hidden = !hasSelection;
    if (!hasSelection) return;

    const hasFile = fileButton instanceof HTMLButtonElement && !fileButton.hidden;
    ficha.status.textContent = hasFile ? 'Dispoñible' : 'Non dispoñible';
    ficha.button.textContent = hasFile ? 'Abrir PDF' : 'Sen ficha';
    ficha.button.disabled = !hasFile;

    const hasAcceptance = acceptanceButton instanceof HTMLButtonElement && !acceptanceButton.hidden;
    aceptacion.status.textContent = hasAcceptance ? 'Dispoñible' : 'Pendente de aceptación';
    aceptacion.button.textContent = hasAcceptance ? 'Abrir PDF' : 'Pendente';
    aceptacion.button.disabled = !hasAcceptance;
  };

  select.addEventListener('change', () => window.setTimeout(sync, 0));
  const observer = new MutationObserver(sync);
  observer.observe(card, { attributes: true, attributeFilter: ['hidden'] });
  if (fileButton instanceof HTMLElement) observer.observe(fileButton, { attributes: true, attributeFilter: ['hidden'] });
  if (acceptanceButton instanceof HTMLElement) observer.observe(acceptanceButton, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();