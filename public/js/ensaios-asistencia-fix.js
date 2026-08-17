(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/ensaios')) return;

  let idToken = '';
  let currentDraft = null;
  let currentDraftId = '';
  let refreshTimer = 0;

  const norm = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const truthy = (value) => value === true || ['true','1','si','sí','yes','x'].includes(norm(value));
  const personId = (row) => String(row?.persoa || row?.idPersoa || '').trim();
  const rehearsalId = () => String(document.querySelector('#repertoire-list')?.dataset?.draftRehearsal || '').trim();

  const style = document.createElement('style');
  style.textContent = `
    #attendance-panel .justify{display:inline-flex;align-items:center;gap:.42rem;white-space:nowrap}
    #attendance-panel .justify input{accent-color:var(--color-principal,#6b1d2f)}
    #attendance-panel .justify input:not(:disabled){cursor:pointer}
    #attendance-panel .justify input:disabled{cursor:not-allowed;opacity:.45}
    #attendance-panel .person-row[data-attendance-state="non-asiste"] .justify{font-weight:700;color:#4f4945}
    #attendance-panel .justification-reason-wrap{grid-column:1/-1;display:grid;grid-template-columns:minmax(150px,220px) minmax(0,1fr);gap:.55rem;align-items:center;margin-top:.15rem;padding:.65rem .75rem;border:1px solid #e3ddd8;border-radius:3px;background:#faf9f7}
    #attendance-panel .justification-reason-wrap span{font-size:.76rem;font-weight:700;color:#4f4945}
    #attendance-panel .justification-reason{width:100%;min-width:0;box-sizing:border-box;border:1px solid #d8d1cb;border-radius:3px;background:#fff;padding:.55rem .65rem;font:inherit;font-size:.82rem;color:#35302d}
    #attendance-panel .justification-reason:focus{outline:2px solid rgba(107,29,47,.08);outline-offset:1px;border-color:var(--color-principal,#6b1d2f)}
    @media(max-width:700px){#attendance-panel .justification-reason-wrap{grid-template-columns:1fr}}
  `;
  document.head.append(style);

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

  async function postDraft(accion, extra = {}, id = rehearsalId()) {
    if (!idToken) idToken = await readFirebaseToken();
    if (!idToken) throw new Error('A sesión non está dispoñible.');
    if (!id) throw new Error('Non se puido identificar o ensaio.');
    const response = await fetch('/api/ensaios-borrador', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ idToken, accion, idEnsaio:id, ...extra })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.erro || `Erro ${response.status}`);
    return result;
  }

  function attendanceMap() {
    return new Map((currentDraft?.asistencias || []).map((item) => [personId(item), item]));
  }

  function ensureReason(row, attendance) {
    const state = norm(attendance?.estadoAsistencia);
    const justified = state === 'non asiste' && truthy(attendance?.xustificada);
    let wrap = row.querySelector('.justification-reason-wrap');

    if (!justified) {
      wrap?.remove();
      return;
    }

    if (!wrap) {
      wrap = document.createElement('label');
      wrap.className = 'justification-reason-wrap';
      wrap.innerHTML = '<span>Motivo da xustificación</span><input class="justification-reason" type="text" maxlength="240" placeholder="Indica o motivo…" autocomplete="off" />';
      row.append(wrap);
    }

    const input = wrap.querySelector('.justification-reason');
    if (input instanceof HTMLInputElement && document.activeElement !== input) {
      input.value = String(attendance?.motivo || '');
    }
  }

  function enhanceRow(row, attendance = {}) {
    const state = norm(attendance?.estadoAsistencia);
    const isPresent = state === 'asiste';
    const isAbsent = state === 'non asiste';

    row.dataset.attendanceState = isPresent ? 'asiste' : isAbsent ? 'non-asiste' : 'sen-marcar';

    row.querySelectorAll('[data-state]').forEach((button) => {
      const active = norm(button.getAttribute('data-state')) === state && (isPresent || isAbsent);
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.title = active ? 'Preme de novo para desmarcar' : '';
    });

    const checkbox = row.querySelector('.justify input[type="checkbox"]');
    if (checkbox instanceof HTMLInputElement) {
      checkbox.disabled = !isAbsent;
      checkbox.checked = isAbsent && truthy(attendance?.xustificada);
      checkbox.title = isAbsent
        ? 'Marca esta casilla só se a ausencia está xustificada'
        : 'Primeiro marca Non asiste';
    }

    ensureReason(row, attendance);
  }

  function enhanceAll() {
    const map = attendanceMap();
    document.querySelectorAll('#attendance-list .person-row[data-person]').forEach((row) => {
      enhanceRow(row, map.get(String(row.dataset.person || '')) || {});
    });
  }

  async function refreshDraft() {
    const id = rehearsalId();
    if (!id) return null;
    try {
      const result = await postDraft('obter', {}, id);
      if (rehearsalId() !== id) return null;
      currentDraft = result.draft;
      currentDraftId = id;
      enhanceAll();
      return currentDraft;
    } catch (error) {
      console.warn('Non se puido actualizar o estado de asistencia:', error);
      return null;
    }
  }

  function scheduleRefresh(delay = 80) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshDraft, delay);
  }

  async function saveAttendance(idPersoa, values, row) {
    const id = rehearsalId();
    const status = row?.querySelector('.save-status');
    if (status) status.textContent = 'Gardando…';

    try {
      const result = await postDraft('gardarAsistencia', { idPersoa, ...values }, id);
      if (rehearsalId() !== id) return;
      currentDraft = result.draft;
      currentDraftId = id;
      const fresh = attendanceMap().get(idPersoa) || {};
      if (row?.isConnected) enhanceRow(row, fresh);
      if (status?.isConnected) status.textContent = '✓ Gardado';
    } catch (error) {
      if (status?.isConnected) status.textContent = `⚠ ${error instanceof Error ? error.message : 'Non se puido gardar'}`;
      await refreshDraft();
    }
  }

  function optimisticAttendance(idPersoa, values, row) {
    if (!currentDraft) return;
    const map = attendanceMap();
    const existing = map.get(idPersoa) || {};
    map.set(idPersoa, {
      ...existing,
      ensaio:rehearsalId(),
      persoa:idPersoa,
      ...values
    });
    currentDraft = { ...currentDraft, asistencias:[...map.values()] };
    enhanceRow(row, map.get(idPersoa));
  }

  // Este controlador captura desde window, antes do controlador xeral de Ensaios.
  // Así só existe unha decisión funcional para Asiste / Non asiste / Xustificada.
  window.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('#attendance-panel .person-row [data-state]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const row = button.closest('.person-row');
    const idPersoa = String(row?.dataset?.person || '');
    if (!row || !idPersoa) return;

    const id = rehearsalId();
    if (!currentDraft || currentDraftId !== id) await refreshDraft();
    const existing = attendanceMap().get(idPersoa) || {};
    const clickedState = String(button.getAttribute('data-state') || '');
    const sameState = norm(existing.estadoAsistencia) === norm(clickedState);

    // Regra inequívoca:
    // - repetir o botón seleccionado = volver ao estado inicial;
    // - calquera cambio de Asiste/Non asiste limpa sempre xustificación e motivo.
    const values = {
      estadoAsistencia:sameState ? '' : clickedState,
      xustificada:false,
      motivo:'',
      observacions:String(existing.observacions || '')
    };

    optimisticAttendance(idPersoa, values, row);
    await saveAttendance(idPersoa, values, row);
  }, true);

  window.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const checkbox = target.closest('#attendance-panel .person-row .justify input[type="checkbox"]');
    if (checkbox instanceof HTMLInputElement) {
      event.stopPropagation();
      event.stopImmediatePropagation();

      const row = checkbox.closest('.person-row');
      const idPersoa = String(row?.dataset?.person || '');
      if (!row || !idPersoa) return;

      const id = rehearsalId();
      if (!currentDraft || currentDraftId !== id) await refreshDraft();
      const existing = attendanceMap().get(idPersoa) || {};

      if (norm(existing.estadoAsistencia) !== 'non asiste') {
        checkbox.checked = false;
        checkbox.disabled = true;
        return;
      }

      const values = {
        estadoAsistencia:'Non asiste',
        xustificada:checkbox.checked,
        motivo:checkbox.checked ? String(existing.motivo || '') : '',
        observacions:String(existing.observacions || '')
      };

      optimisticAttendance(idPersoa, values, row);
      await saveAttendance(idPersoa, values, row);

      if (checkbox.checked) {
        row.querySelector('.justification-reason')?.focus();
      }
      return;
    }

    const reason = target.closest('#attendance-panel .person-row .justification-reason');
    if (reason instanceof HTMLInputElement) {
      event.stopPropagation();
      event.stopImmediatePropagation();

      const row = reason.closest('.person-row');
      const idPersoa = String(row?.dataset?.person || '');
      if (!row || !idPersoa) return;

      const id = rehearsalId();
      if (!currentDraft || currentDraftId !== id) await refreshDraft();
      const existing = attendanceMap().get(idPersoa) || {};
      if (norm(existing.estadoAsistencia) !== 'non asiste' || !truthy(existing.xustificada)) return;

      const values = {
        estadoAsistencia:'Non asiste',
        xustificada:true,
        motivo:reason.value.trim(),
        observacions:String(existing.observacions || '')
      };
      optimisticAttendance(idPersoa, values, row);
      await saveAttendance(idPersoa, values, row);
    }
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-voice]')) scheduleRefresh(120);
  });

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList' && mutation.target instanceof Element && (mutation.target.id === 'attendance-list' || mutation.target.closest?.('#attendance-list')))) {
      scheduleRefresh(90);
    }
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleRefresh(250), { once:true });
  } else {
    scheduleRefresh(250);
  }
})();