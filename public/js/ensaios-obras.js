(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/ensaios')) return;

  let currentRehearsalId = '';

  const style = document.createElement('style');
  style.textContent = `
    #repertoire-panel .work-link,
    #repertoire-panel .work-link:visited,
    #repertoire-panel .work-link:hover,
    #repertoire-panel .work-link:focus {
      color: #24211f !important;
      text-decoration: none !important;
    }
    #repertoire-panel .work-link {
      display: flex !important;
      flex-direction: column !important;
      gap: .42rem !important;
    }
    #repertoire-panel .work-link strong {
      color: #24211f !important;
    }
    #repertoire-panel .work-link small {
      display: block !important;
      margin: 0 !important;
      color: #6d6762 !important;
    }
    #repertoire-panel .work-type,
    #repertoire-panel .work-from,
    #repertoire-panel .work-to {
      display: none !important;
    }
    #repertoire-panel .work-fields {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto auto auto !important;
      align-items: center !important;
      gap: .55rem !important;
    }
    #repertoire-panel .work-notes {
      width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
    }
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
      #repertoire-panel .save-work,
      #repertoire-panel .remove-work { width: 100%; }
    }
  `;
  document.head.append(style);

  function renameLabels() {
    document.querySelectorAll('[data-work="repertorio"], #repertoire-panel h2, #program-dialog .section-kicker').forEach((node) => {
      if (node.textContent?.trim() === 'Obras traballadas') node.textContent = 'Obras';
    });
    const summary = document.querySelector('#repertoire-summary');
    if (summary?.textContent) summary.textContent = summary.textContent.replace(/\s+traballadas?$/i, ' obras');
  }

  function inferCurrentRehearsal() {
    if (currentRehearsalId) return currentRehearsalId;
    const heroDate = document.querySelector('#next-rehearsal h2')?.textContent?.trim();
    if (!heroDate) return '';
    const match = Array.from(document.querySelectorAll('[data-rehearsal]')).find((button) => {
      const date = button.querySelector('time')?.textContent?.trim();
      return date === heroDate;
    });
    currentRehearsalId = match?.getAttribute('data-rehearsal') || '';
    return currentRehearsalId;
  }

  function enhanceRows() {
    renameLabels();
    inferCurrentRehearsal();
    document.querySelectorAll('#repertoire-list .work-row').forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const fields = row.querySelector('.work-fields');
      if (!(fields instanceof HTMLElement)) return;
      if (!fields.querySelector('.remove-work')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'remove-work';
        button.textContent = 'Eliminar';
        const status = fields.querySelector('.save-status');
        fields.insertBefore(button, status || null);
      }
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

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rehearsal = target.closest('[data-rehearsal]');
    if (rehearsal) currentRehearsalId = rehearsal.getAttribute('data-rehearsal') || '';
  }, true);

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('.remove-work');
    if (!(button instanceof HTMLButtonElement)) return;

    const row = button.closest('.work-row');
    if (!(row instanceof HTMLElement)) return;
    const idRepertorio = row.dataset.workId || '';
    const idEnsaio = inferCurrentRehearsal();
    const message = document.querySelector('#repertoire-message');

    if (!idEnsaio) {
      if (message) message.textContent = '⚠ Non foi posible identificar o ensaio activo. Abre o ensaio desde Calendario e téntao de novo.';
      return;
    }
    if (!idRepertorio) return;
    if (!window.confirm('Eliminar esta obra do ensaio? A obra seguirá existindo en Repertorio.')) return;

    button.disabled = true;
    if (message) message.textContent = 'Eliminando obra…';

    try {
      const idToken = await readFirebaseToken();
      if (!idToken) throw new Error('Non foi posible recuperar a sesión.');

      const response = await fetch('/api/ensaios-eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, idEnsaio, idRepertorio })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.erro || 'Non foi posible eliminar a obra.');

      const refresh = await fetch('/api/ensaios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, accion: 'listarEnsaiosPortal', forzar: true })
      });
      if (!refresh.ok) throw new Error('A obra eliminouse, pero non se puido actualizar a vista.');

      if (message) message.textContent = '✓ Obra eliminada.';
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      if (message) message.textContent = `⚠ ${error instanceof Error ? error.message : 'Non foi posible eliminar a obra.'}`;
    }
  });

  const list = document.querySelector('#repertoire-list');
  if (list) {
    const observer = new MutationObserver(() => enhanceRows());
    observer.observe(list, { childList: true, subtree: true });
  }

  enhanceRows();
  window.setTimeout(enhanceRows, 500);
  window.setTimeout(enhanceRows, 1500);
})();