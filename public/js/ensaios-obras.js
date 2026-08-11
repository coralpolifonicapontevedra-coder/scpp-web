(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/ensaios')) return;

  let currentRehearsalId = '';
  let syncing = false;
  let syncPending = false;

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
    #repertoire-panel .work-link strong { color: #24211f !important; }
    #repertoire-panel .work-link small {
      display: block !important;
      margin: 0 !important;
      color: #6d6762 !important;
    }
    #repertoire-panel .work-type,
    #repertoire-panel .work-from,
    #repertoire-panel .work-to { display: none !important; }
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

  const esc = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function normalize(value = '') {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function renameLabels() {
    document.querySelectorAll('[data-work="repertorio"], #repertoire-panel h2, #program-dialog .section-kicker').forEach((node) => {
      if (node.textContent?.trim() === 'Obras traballadas') node.textContent = 'Obras';
    });
    const summary = document.querySelector('#repertoire-summary');
    if (summary?.textContent) summary.textContent = summary.textContent.replace(/\s+traballadas?$/i, ' obras');
  }

  function inferCurrentRehearsalFromDom() {
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

  function inferCurrentRehearsalFromPayload(payload) {
    if (currentRehearsalId) return currentRehearsalId;
    const rows = Array.isArray(payload?.ensaios) ? payload.ensaios : [];
    if (!rows.length) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const candidates = rows
      .filter((item) => !item.cancelado)
      .map((item) => {
        const raw = String(item.data || '').slice(0, 10);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : null;
        return { item, date };
      })
      .filter(({ date }) => date && !Number.isNaN(date.getTime()) && date >= today)
      .sort((a, b) => a.date - b.date);

    const next = candidates[0]?.item || rows[0];
    currentRehearsalId = String(next?.idEnsaio || next?.id || '').trim();
    return currentRehearsalId;
  }

  function enhanceRows() {
    renameLabels();
    inferCurrentRehearsalFromDom();
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

  async function fetchFreshPayload(idToken) {
    const response = await fetch('/api/ensaios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, accion: 'listarEnsaiosPortal', forzar: true })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.erro || 'Non foi posible actualizar a vista.');
    return result;
  }

  function resolveWork(ref, repertoire) {
    const key = String(ref || '').trim();
    if (!key) return null;

    let work = repertoire.find((item) => String(item.idRepertorio || item.id || '').trim() === key);
    if (work) return work;

    const normalizedKey = normalize(key);
    work = repertoire.find((item) => {
      const id = normalize(item.idRepertorio || item.id || '');
      const title = normalize(item.nomeObra || item.nome || '');
      return id === normalizedKey || title === normalizedKey;
    });
    if (work) return work;

    // Compatibilidade con referencias antigas que gardaban o número de fila da Sheet.
    const numeric = Number(key.replace(',', '.'));
    if (Number.isInteger(numeric) && numeric > 0) {
      const candidates = [numeric - 2, numeric - 1, numeric];
      for (const index of candidates) {
        if (index >= 0 && index < repertoire.length) {
          const candidate = repertoire[index];
          if (candidate?.nomeObra || candidate?.nome) return candidate;
        }
      }
    }
    return null;
  }

  function buildWorkRow(record, repertoire) {
    const id = String(record.repertorio || record.idRepertorio || '').trim();
    const work = resolveWork(id, repertoire);
    const title = work?.nomeObra || work?.nome || 'Obra sen identificar';
    const composer = work?.compositor || '';
    const targetId = String(work?.idRepertorio || work?.id || id).trim();
    return `<article class="work-row" data-work-id="${esc(id)}">
      <div class="work-main">
        <a class="work-link" href="/portal/repertorio/?id=${encodeURIComponent(targetId)}">
          <strong>${esc(title)}</strong>${composer ? `<small>${esc(composer)}</small>` : ''}
        </a>
      </div>
      <div class="work-fields">
        <select class="work-type"><option value="">Tipo de traballo</option></select>
        <input class="work-from" placeholder="Desde" />
        <input class="work-to" placeholder="Ata" />
        <input class="work-notes" placeholder="Observacións" value="${esc(record.observacions || '')}" />
        <button class="save-work" type="button">Gardar</button>
        <button class="remove-work" type="button">Eliminar</button>
        <span class="save-status"></span>
      </div>
    </article>`;
  }

  function rebuildSearch(payload, workedIds) {
    const select = document.querySelector('#work-search-select');
    const input = document.querySelector('#work-search-input');
    if (!(select instanceof HTMLSelectElement)) return;
    const query = normalize(input?.value || '');
    const options = (payload.repertorio || [])
      .filter((work) => {
        const id = String(work.idRepertorio || work.id || '');
        const haystack = normalize([work.nomeObra, work.nome, work.compositor].filter(Boolean).join(' '));
        return !workedIds.has(id) && (!query || haystack.includes(query));
      })
      .sort((a, b) => String(a.nomeObra || a.nome || '').localeCompare(String(b.nomeObra || b.nome || ''), 'gl', { sensitivity:'base' }))
      .slice(0, 80);
    select.innerHTML = '<option value="">Escolle unha obra…</option>' + options.map((work) => `<option value="${esc(work.idRepertorio || work.id || '')}">${esc([work.nomeObra || work.nome, work.compositor].filter(Boolean).join(' — '))}</option>`).join('');
  }

  function syncRows(payload) {
    const idEnsaio = inferCurrentRehearsalFromDom() || inferCurrentRehearsalFromPayload(payload);
    const list = document.querySelector('#repertoire-list');
    if (!idEnsaio || !(list instanceof HTMLElement)) return;

    const worked = (payload.ensaiosRepertorio || [])
      .filter((row) => String(row.ensaio || row.idEnsaio || '') === idEnsaio)
      .sort((a, b) => Number(a.orde || 999) - Number(b.orde || 999));
    const repertoire = Array.isArray(payload.repertorio) ? payload.repertorio : [];

    list.innerHTML = worked.length
      ? worked.map((record) => buildWorkRow(record, repertoire)).join('')
      : '<p class="empty-state">Aínda non se rexistraron obras neste ensaio.</p>';

    const summary = document.querySelector('#repertoire-summary');
    if (summary) summary.textContent = `${worked.length} obras`;
    rebuildSearch(payload, new Set(worked.map((row) => String(row.repertorio || row.idRepertorio || ''))));
    enhanceRows();
  }

  async function refreshAndSync() {
    if (syncing) {
      syncPending = true;
      return;
    }
    syncing = true;
    try {
      const idToken = await readFirebaseToken();
      if (!idToken) return;
      const payload = await fetchFreshPayload(idToken);
      syncRows(payload);
    } catch (error) {
      console.warn('Non se puido actualizar automaticamente a lista de obras:', error);
    } finally {
      syncing = false;
      if (syncPending) {
        syncPending = false;
        window.setTimeout(refreshAndSync, 50);
      }
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rehearsal = target.closest('[data-rehearsal]');
    if (rehearsal) currentRehearsalId = rehearsal.getAttribute('data-rehearsal') || '';
  }, true);

  // Tras engadir unha obra, incluso se hai unha sincronización previa en curso,
  // queda programada outra actualización para reflectir o cambio sen recargar a páxina.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#add-work')) {
      window.setTimeout(refreshAndSync, 350);
      window.setTimeout(refreshAndSync, 1200);
    }
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target instanceof Element && event.target.matches('#program-form')) {
      window.setTimeout(refreshAndSync, 500);
      window.setTimeout(refreshAndSync, 1500);
    }
  }, true);

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('.remove-work');
    if (!(button instanceof HTMLButtonElement)) return;

    const row = button.closest('.work-row');
    if (!(row instanceof HTMLElement)) return;
    const idRepertorio = row.dataset.workId || '';
    const idEnsaio = inferCurrentRehearsalFromDom() || currentRehearsalId;
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

      // Retirada visual inmediata e sincronización posterior coa fonte de verdade.
      row.remove();
      const remaining = document.querySelectorAll('#repertoire-list .work-row').length;
      const summary = document.querySelector('#repertoire-summary');
      if (summary) summary.textContent = `${remaining} obras`;
      if (message) message.textContent = '✓ Obra eliminada.';
      await refreshAndSync();
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

  const repertoireMessage = document.querySelector('#repertoire-message');
  if (repertoireMessage) {
    const messageObserver = new MutationObserver(() => {
      if (/^✓/.test(repertoireMessage.textContent?.trim() || '')) refreshAndSync();
    });
    messageObserver.observe(repertoireMessage, { childList: true, characterData: true, subtree: true });
  }

  enhanceRows();
  window.setTimeout(enhanceRows, 400);
  window.setTimeout(refreshAndSync, 900);
})();