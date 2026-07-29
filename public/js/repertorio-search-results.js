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
        margin-top: .65rem;
        overflow: hidden;
        border: 1px solid #d5d0cb;
        border-radius: 4px;
        background: #fff;
      }
      .work-search-result {
        display: grid;
        gap: .12rem;
        width: 100%;
        padding: .7rem .85rem;
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
      .work-search-result:focus-visible {
        background: #f7eff1;
        outline: none;
      }
      .work-search-result strong {
        color: var(--color-principal, #6a1b29);
        font-size: .88rem;
        font-weight: 700;
      }
      .work-search-result small {
        color: #6d6762;
        font-size: .72rem;
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

      // O selector xa foi filtrado pola lóxica principal usando título,
      // autor da letra e compositor. Reutilizamos esas opcións para non
      // perder coincidencias que non aparecen completas na etiqueta visible.
      const matches = Array.from(select.options)
        .filter((option) => option.value)
        .slice(0, 10);

      results.hidden = matches.length === 0;

      matches.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'work-search-result';
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
