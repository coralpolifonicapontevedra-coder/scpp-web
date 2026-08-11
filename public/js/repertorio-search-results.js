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
      .work-search-feedback strong { color: var(--color-principal, #6a1b29); font-size: .79rem; }
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
      .work-search-result:hover,.work-search-result:focus-visible { background: #f7eff1; outline: none; }
      .work-search-result.is-single { background: #fbf6f7; box-shadow: inset 3px 0 var(--color-principal, #6a1b29); }
      .work-search-result strong { min-width: 0; color: var(--color-principal, #6a1b29); font-size: .88rem; font-weight: 700; }
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
      return { title: label.slice(0, separator), author: label.slice(separator + 3) };
    };

    const render = () => {
      const query = normalize(search.value);
      results.replaceChildren();
      if (!query) { results.hidden = true; return; }

      const allMatches = Array.from(select.options).filter((option) => option.value);
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
      feedbackHint.textContent = allMatches.length === 1 ? 'Preme na obra para abrir a súa ficha.' : 'Escolle unha das coincidencias.';
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

    search.addEventListener('input', () => window.setTimeout(render, 0));
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { results.hidden = true; return; }
      if (event.key === 'Enter') {
        const first = results.querySelector('.work-search-result');
        if (first instanceof HTMLButtonElement) { event.preventDefault(); first.click(); }
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

  function readFirebaseToken() {
    return new Promise((resolve) => {
      const request = indexedDB.open('firebaseLocalStorageDb');
      request.onerror = () => resolve('');
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('firebaseLocalStorage', 'readonly');
          const store = tx.objectStore('firebaseLocalStorage');
          const all = store.getAll();
          all.onerror = () => resolve('');
          all.onsuccess = () => {
            const entry = (all.result || []).find((item) => item?.value?.stsTokenManager?.accessToken);
            resolve(String(entry?.value?.stsTokenManager?.accessToken || ''));
          };
        } catch {
          resolve('');
        }
      };
    });
  }

  function setupEnsaiosWorks() {
    if (!window.location.pathname.startsWith('/portal/ensaios')) return;

    const style = document.createElement('style');
    style.textContent = `
      #repertoire-panel .work-link,
      #repertoire-panel .work-link:visited,
      #repertoire-panel .work-link:hover,
      #repertoire-panel .work-link:focus { color: #24211f !important; text-decoration: none !important; }
      #repertoire-panel .work-link { display: flex !important; flex-direction: column; gap: .42rem !important; }
      #repertoire-panel .work-link strong { color: #24211f !important; }
      #repertoire-panel .work-link small { display: block; margin: 0; color: #6d6762 !important; }
      #repertoire-panel .work-type,
      #repertoire-panel .work-from,
      #repertoire-panel .work-to { display: none !important; }
      #repertoire-panel .work-fields {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto auto auto !important;
        align-items: center;
        gap: .55rem !important;
      }
      #repertoire-panel .work-notes { width: 100%; min-width: 0; box-sizing: border-box; }
      #repertoire-panel .remove-work {
        border: 1px solid #cdbfc1;
        background: #fff;
        color: #6a1b29;
        padding: .55rem .8rem;
        cursor: pointer;
        font-weight: 700;
      }
      #repertoire-panel .remove-work:hover { background: #f8f1f2; }
      @media (max-width: 680px) {
        #repertoire-panel .work-fields { grid-template-columns: 1fr !important; }
        #repertoire-panel .save-work,#repertoire-panel .remove-work { width: 100%; }
      }
    `;
    document.head.append(style);

    const rename = () => {
      document.querySelectorAll('#repertoire-panel h2, [data-work="repertorio"], #program-dialog .section-kicker').forEach((node) => {
        if (node.textContent?.trim() === 'Obras traballadas') node.textContent = 'Obras';
      });
      const summary = document.querySelector('#repertoire-summary');
      if (summary?.textContent) summary.textContent = summary.textContent.replace(/\s+traballadas?$/i, ' obras');
      document.querySelectorAll('#tracking-kpis span').forEach((node) => {
        if (node.textContent?.trim() === 'Obras traballadas') node.textContent = 'Obras';
      });
    };

    const enhanceRows = () => {
      rename();
      document.querySelectorAll('#repertoire-list .work-row').forEach((row) => {
        if (!(row instanceof HTMLElement) || row.querySelector('.remove-work')) return;
        const fields = row.querySelector('.work-fields');
        if (!(fields instanceof HTMLElement)) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'remove-work';
        button.textContent = 'Eliminar';
        const status = fields.querySelector('.save-status');
        fields.insertBefore(button, status || null);
      });
    };

    document.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('.remove-work');
      if (!(button instanceof HTMLButtonElement)) return;
      const row = button.closest('.work-row');
      if (!(row instanceof HTMLElement)) return;
      const idRepertorio = row.dataset.workId || '';
      const message = document.querySelector('#repertoire-message');
      if (!idRepertorio) return;
      if (!window.confirm('Eliminar esta obra do ensaio? A obra seguirá existindo en Repertorio.')) return;

      button.disabled = true;
      if (message) message.textContent = 'Eliminando obra…';
      try {
        const idToken = await readFirebaseToken();
        if (!idToken) throw new Error('Non foi posible recuperar a sesión.');
        const rehearsalCard = document.querySelector('#next-rehearsal');
        const selected = document.querySelector('[data-rehearsal].is-selected');
        let idEnsaio = selected?.getAttribute('data-rehearsal') || '';
        if (!idEnsaio) {
          const visibleRow = document.querySelector('#repertoire-list .work-row');
          const all = document.querySelectorAll('[data-rehearsal]');
          if (all.length === 1) idEnsaio = all[0].getAttribute('data-rehearsal') || '';
        }
        if (!idEnsaio) {
          const active = Array.from(document.querySelectorAll('[data-rehearsal]')).find((item) => item instanceof HTMLElement && !item.closest('[hidden]'));
          idEnsaio = active?.getAttribute('data-rehearsal') || '';
        }
        if (!idEnsaio) throw new Error('Non foi posible identificar o ensaio activo.');

        const response = await fetch('/api/ensaios-eliminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, idEnsaio, idRepertorio })
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) throw new Error(result?.erro || 'Non foi posible eliminar a obra.');
        if (message) message.textContent = '✓ Obra eliminada.';
        const retry = document.querySelector('#retry-button');
        if (retry instanceof HTMLButtonElement) retry.click(); else window.location.reload();
      } catch (error) {
        button.disabled = false;
        if (message) message.textContent = `⚠ ${error instanceof Error ? error.message : 'Non foi posible eliminar a obra.'}`;
      }
    });

    const observer = new MutationObserver(enhanceRows);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    enhanceRows();
  }

  const boot = () => { setupSearchResults(); setupEnsaiosWorks(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();