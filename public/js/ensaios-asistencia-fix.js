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
    #attendance-panel .justify input:not(:disabled){accent-color:var(--color-principal,#6b1d2f);cursor:pointer}
    #attendance-panel .justify input:disabled{cursor:not-allowed;opacity:.45}
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
    const checked = truthy(attendance?.xustificada);
    const state = norm(attendance?.estadoAsistencia);
    let wrap = row.querySelector('.justification-reason-wrap');
    if (state !== 'non asiste' || !checked) {
      wrap?.remove();
      return;
    }
    if (!wrap) {
      wrap = document.createElement('label');
      wrap.className = 'justification-reason-wrap';
      wrap.innerHTML = '<span>Motivo da xustificación</span><input class="justification-reason" type="text" maxlength="240" placeholder="Indica o motivo…" />';
      const status = row.querySelector('.save-status');
      if (status) row.insertBefore(wrap, status);
      else row.append(wrap);
    }
    const input = wrap.querySelector('.justification-reason');
    if (input instanceof HTMLInputElement && document.activeElement !== input) input.value = String(attendance?.motivo || '');
  }

  function enhanceRow(row, attendance = {}) {
    const state = norm(attendance?.estadoAsistencia);
    row.querySelectorAll('[data-state]').forEach((button) => {
      const active = norm(button.getAttribute('data-state')) === state && ['asiste','non asiste'].includes(state);
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const checkbox = row.querySelector('.justify input[type="checkbox"]');
    if (checkbox instanceof HTMLInputElement) {
      const canJustify = state === 'non asiste';
      checkbox.disabled = !canJustify;
      checkbox.checked = canJustify && truthy(attendance?.xustificada);
      checkbox.title = canJustify ? 'Marcar ausencia como xustificada' : 'Só dispoñible cando se marca Non asiste';
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
    if (!id) return;
    try {
      const result = await postDraft('obter', {}, id);
      if (rehearsalId() !== id) return;
      currentDraft = result.draft;
      currentDraftId = id;
      enhanceAll();
    } catch (error) {
      console.warn('Non se puido actualizar o estado de xustificacións:', error);
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

  // O controlador principal de Ensaios escoita en document e detén a propagación.
  // Capturamos desde window para que esta sexa a lóxica autoritativa da asistencia.
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
    const same = norm(existing.estadoAsistencia) === norm(clickedState);
    const estadoAsistencia = same ? '' : clickedState;
    const keepJustification = norm(estadoAsistencia) === 'non asiste' && norm(existing.estadoAsistencia) === 'non asiste';
    const values = {
      estadoAsistencia,
      xustificada:keepJustification ? truthy(existing.xustificada) : false,
      motivo:keepJustification ? String(existing.motivo || '') : '',
      observacions:String(existing.observacions || '')
    };

    if (currentDraft) {
      const map = attendanceMap();
      map.set(idPersoa, { ...existing, ensaio:id, persoa:idPersoa, ...values });
      currentDraft = { ...currentDraft, asistencias:[...map.values()] };
      enhanceRow(row, map.get(idPersoa));
    }
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
      if (currentDraft) {
        const map = attendanceMap();
        map.set(idPersoa, { ...existing, ...values });
        currentDraft = { ...currentDraft, asistencias:[...map.values()] };
        enhanceRow(row, map.get(idPersoa));
      }
      await saveAttendance(idPersoa, values, row);
      if (checkbox.checked) row.querySelector('.justification-reason')?.focus();
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
      await saveAttendance(idPersoa, {
        estadoAsistencia:'Non asiste',
        xustificada:true,
        motivo:reason.value.trim(),
        observacions:String(existing.observacions || '')
      }, row);
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scheduleRefresh(250), { once:true });
  else scheduleRefresh(250);
})();