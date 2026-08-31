(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/ensaios')) return;
  window.__SCPP_ENSAIOS_BORRADOR_R2__ = true;

  let idToken = '';
  let basePayload = null;
  let currentRehearsalId = '';
  let draft = null;
  let loadingDraft = false;

  const esc = (value = '') => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const norm = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const compactNorm = (value = '') => norm(value).replace(/[^a-z0-9]/g, '');
  const personName = (person) => person?.nomeCompleto || [person?.nome, person?.primeiroApelido, person?.segundoApelido].filter(Boolean).join(' ');
  const rehearsalId = (item) => String(item?.idEnsaio || item?.id || '').trim();
  const workId = (row) => String(row?.repertorio || row?.idRepertorio || '').trim();
  const personId = (row) => String(row?.persoa || row?.idPersoa || '').trim();
  const truthy = (value) => value === true || ['true','1','si','sí','yes','x'].includes(norm(value));

  const style = document.createElement('style');
  style.textContent = `
    .rehearsal-final-actions{display:flex;align-items:center;justify-content:flex-end;gap:.75rem;margin-top:1.15rem;padding-top:1rem;border-top:1px solid #e7e1dc}
    .finish-rehearsal{border:0;background:var(--color-principal,#6b1d2f);color:#fff;padding:.72rem 1rem;font-weight:700;cursor:pointer}
    .finish-rehearsal:disabled{opacity:.55;cursor:wait}
    .finish-status{font-size:.78rem;color:#6f665f}
    #repertoire-panel .remove-work{border:1px solid #cdbfc1;background:#fff;color:#6a1b29;padding:.55rem .8rem;cursor:pointer;font-weight:700}
    #repertoire-panel .remove-work:hover{background:#f8f1f2}
    #repertoire-panel .work-link,#repertoire-panel .work-link:visited{color:#24211f;text-decoration:none}
    @media(max-width:680px){.rehearsal-final-actions{display:grid;grid-template-columns:1fr}.finish-rehearsal{width:100%}}
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

  async function post(url, body) {
    const response = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ idToken, ...body })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.erro || `Erro ${response.status}`);
    return result;
  }

  const apiMain = (accion, extra = {}) => post('/api/ensaios', { accion, ...extra });
  const apiDraft = (accion, extra = {}) => post('/api/ensaios-borrador', { accion, idEnsaio:currentRehearsalId, ...extra });

  function toDate(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const iso = /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text.split(/[\/-]/).reverse().join('-');
    const date = new Date(`${iso}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function nextRehearsalId() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const candidates = (basePayload?.ensaios || [])
      .filter((item) => !truthy(item.cancelado))
      .map((item) => ({ item, date:toDate(item.data) }))
      .filter(({ date }) => !date || date >= today)
      .sort((a,b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    return rehearsalId(candidates[0]?.item || basePayload?.ensaios?.[0]);
  }

  function workById(id) {
    const key = String(id || '').trim();
    let found = (basePayload?.repertorio || []).find((item) => String(item.idRepertorio || item.id || '').trim() === key);
    if (found) return found;
    const numeric = Number(key.replace(',', '.'));
    if (Number.isInteger(numeric) && numeric > 0) {
      for (const index of [numeric - 2, numeric - 1, numeric]) {
        const candidate = basePayload?.repertorio?.[index];
        if (candidate?.nomeObra || candidate?.nome) return candidate;
      }
    }
    return null;
  }

  function renderWorkSearch() {
    const select = document.querySelector('#work-search-select');
    const input = document.querySelector('#work-search-input');
    if (!(select instanceof HTMLSelectElement) || !draft) return;
    const query = norm(input?.value || '');
    const already = new Set((draft.repertorio || []).map(workId));
    const options = (basePayload?.repertorio || [])
      .filter((work) => {
        const id = String(work.idRepertorio || work.id || '');
        const haystack = norm([work.nomeObra, work.nome, work.compositor].filter(Boolean).join(' '));
        return !already.has(id) && (!query || haystack.includes(query));
      })
      .sort((a,b) => String(a.nomeObra || a.nome || '').localeCompare(String(b.nomeObra || b.nome || ''), 'gl', { sensitivity:'base' }))
      .slice(0, 80);
    select.innerHTML = '<option value="">Escolle unha obra…</option>' + options.map((work) => `<option value="${esc(work.idRepertorio || work.id || '')}">${esc([work.nomeObra || work.nome, work.compositor].filter(Boolean).join(' — '))}</option>`).join('');
  }

  function renderRepertoire() {
    if (!draft) return;
    const list = document.querySelector('#repertoire-list');
    if (!(list instanceof HTMLElement)) return;
    const rows = [...(draft.repertorio || [])].sort((a,b) => Number(a.orde || 999) - Number(b.orde || 999));
    const summary = document.querySelector('#repertoire-summary');
    if (summary) summary.textContent = `${rows.length} obras`;
    list.innerHTML = rows.length ? rows.map((row) => {
      const id = workId(row);
      const work = workById(id) || {};
      const title = work.nomeObra || work.nome || 'Obra sen identificar';
      const targetId = String(work.idRepertorio || work.id || id);
      return `<article class="work-row" data-work-id="${esc(id)}">
        <div class="work-main"><a class="work-link" href="/portal/repertorio/?id=${encodeURIComponent(targetId)}"><strong>${esc(title)}</strong>${work.compositor ? `<small>${esc(work.compositor)}</small>` : ''}</a></div>
        <div class="work-fields">
          <select class="work-type"><option value="">Tipo de traballo</option>${['Lectura','Montaxe','Repaso','Perfeccionamento','Interpretación completa'].map((value) => `<option ${row.tipoTraballo === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
          <input class="work-from" placeholder="Desde" value="${esc(row.desde || '')}"/>
          <input class="work-to" placeholder="Ata" value="${esc(row.ata || '')}"/>
          <input class="work-notes" placeholder="Observacións" value="${esc(row.observacions || '')}"/>
          <button class="save-work" type="button">Gardar</button>
          <button class="remove-work" type="button">Eliminar</button>
          <span class="save-status"></span>
        </div>
      </article>`;
    }).join('') : '<p class="empty-state">Aínda non se rexistraron obras neste ensaio.</p>';
    renderWorkSearch();
  }

  function attendanceMap() {
    return new Map((draft?.asistencias || []).map((row) => [personId(row), row]));
  }

  function selectedVoice() {
    return document.querySelector('.voice-tabs [data-voice].is-active')?.getAttribute('data-voice') || 'Asistentes';
  }

  function renderAttendance() {
    if (!draft) return;
    const list = document.querySelector('#attendance-list');
    if (!(list instanceof HTMLElement)) return;
    const people = [...(basePayload?.persoas || [])];
    const map = attendanceMap();
    const voice = selectedVoice();
    const title = document.querySelector('#attendance-title');
    const summary = document.querySelector('#attendance-summary');

    if (voice === 'Asistentes') {
      let total = 0;
      const sections = ['Soprano','Contralto','Tenor','Baixo'].map((name) => {
        const present = people.filter((person) => norm(person.voz) === norm(name) && norm(map.get(String(person.idPersoa || person.id || ''))?.estadoAsistencia) === 'asiste')
          .sort((a,b) => personName(a).localeCompare(personName(b), 'gl', { sensitivity:'base' }));
        total += present.length;
        const label = name === 'Baixo' ? 'Baixos' : `${name}s`;
        return `<section class="attendance-group"><header><h3>${esc(label)}</h3><strong>${present.length}</strong></header>${present.length ? `<div class="attendee-names">${present.map((person) => `<span>${esc(personName(person))}</span>`).join('')}</div>` : '<p class="helper group-empty">Sen asistentes rexistrados.</p>'}</section>`;
      }).join('');
      if (title) title.textContent = 'Asistentes';
      if (summary) summary.textContent = `${total} asistentes`;
      list.innerHTML = sections;
      return;
    }

    const filtered = people.filter((person) => norm(person.voz) === norm(voice)).sort((a,b) => personName(a).localeCompare(personName(b), 'gl', { sensitivity:'base' }));
    const present = filtered.filter((person) => norm(map.get(String(person.idPersoa || person.id || ''))?.estadoAsistencia) === 'asiste').length;
    const decided = filtered.filter((person) => ['asiste','non asiste'].includes(norm(map.get(String(person.idPersoa || person.id || ''))?.estadoAsistencia))).length;
    if (title) title.textContent = voice === 'Baixo' ? 'Baixos' : `${voice}s`;
    if (summary) summary.textContent = `${present} asisten · ${decided}/${filtered.length} rexistrados`;
    list.innerHTML = filtered.map((person) => {
      const id = String(person.idPersoa || person.id || '');
      const attendance = map.get(id) || {};
      const state = norm(attendance.estadoAsistencia);
      return `<article class="person-row" data-person="${esc(id)}"><strong>${esc(personName(person))}</strong><div class="attendance-actions"><button type="button" class="${state === 'asiste' ? 'is-selected' : ''}" data-state="Asiste">✓ Asiste</button><button type="button" class="${state === 'non asiste' ? 'is-selected negative' : ''}" data-state="Non asiste">× Non asiste</button></div><label class="justify"><input type="checkbox" ${truthy(attendance.xustificada) ? 'checked' : ''} disabled /> Xustificada</label><span class="save-status"></span></article>`;
    }).join('') || '<p class="empty-state">Non hai persoas nesta corda.</p>';
  }

  function installFinishButton() {
    const panel = document.querySelector('#work-panel');
    if (!(panel instanceof HTMLElement) || panel.querySelector('#finish-rehearsal')) return;
    const box = document.createElement('div');
    box.className = 'rehearsal-final-actions';
    box.innerHTML = '<span id="finish-rehearsal-status" class="finish-status" aria-live="polite"></span><button id="finish-rehearsal" class="finish-rehearsal" type="button">Finalizar ensaio</button>';
    panel.append(box);
  }

  function renderDraft() {
    renderAttendance();
    renderRepertoire();
    installFinishButton();
  }

  async function loadDraft(id = currentRehearsalId) {
    if (!id || loadingDraft) return;
    loadingDraft = true;
    currentRehearsalId = id;
    const message = document.querySelector('#repertoire-message');
    try {
      const result = await apiDraft('obter');
      draft = result.draft;
      renderDraft();
      if (message && /cargando/i.test(message.textContent || '')) message.textContent = '';
    } catch (error) {
      if (message) message.textContent = `⚠ ${error instanceof Error ? error.message : 'Non foi posible recuperar o ensaio.'}`;
    } finally {
      loadingDraft = false;
    }
  }

  async function init() {
    installFinishButton();
    idToken = await readFirebaseToken();
    if (!idToken) {
      window.setTimeout(init, 700);
      return;
    }
    try {
      basePayload = await apiMain('listarEnsaiosPortal');
      currentRehearsalId = nextRehearsalId();
      await loadDraft(currentRehearsalId);
    } catch (error) {
      console.warn('Non se puido iniciar o borrador R2 de Ensaios:', error);
    }
  }

  document.addEventListener('input', (event) => {
    if (event.target instanceof Element && event.target.matches('#work-search-input')) renderWorkSearch();
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const rehearsalButton = target.closest('[data-rehearsal]');
    if (rehearsalButton) {
      const id = rehearsalButton.getAttribute('data-rehearsal') || '';
      window.setTimeout(() => loadDraft(id), 0);
      return;
    }

    const voiceButton = target.closest('[data-voice]');
    if (voiceButton) {
      window.setTimeout(renderAttendance, 0);
      return;
    }

    const addButton = target.closest('#add-work');
    if (addButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const select = document.querySelector('#work-search-select');
      const message = document.querySelector('#repertoire-message');
      const id = select instanceof HTMLSelectElement ? select.value : '';
      if (!id || !draft) { if (message) message.textContent = 'Escolle primeiro unha obra.'; return; }
      const previous = structuredClone(draft);
      if (!(draft.repertorio || []).some((row) => workId(row) === id)) {
        draft.repertorio.push({ ensaio:currentRehearsalId, repertorio:id, orde:draft.repertorio.length + 1, tipoTraballo:'', desde:'', ata:'', observacions:'' });
      }
      renderRepertoire();
      if (message) message.textContent = 'Gardando…';
      apiDraft('gardarObra', { idRepertorio:id, orde:draft.repertorio.length, tipoTraballo:'', desde:'', ata:'', observacions:'' })
        .then((result) => { draft = result.draft; renderRepertoire(); if (message) message.textContent = '✓ Obra gardada.'; })
        .catch((error) => { draft = previous; renderRepertoire(); if (message) message.textContent = `⚠ ${error.message}`; });
      return;
    }

    const remove = target.closest('.remove-work');
    if (remove) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = remove.closest('.work-row');
      const id = row?.getAttribute('data-work-id') || '';
      const message = document.querySelector('#repertoire-message');
      if (!id || !draft) return;
      if (!window.confirm('Eliminar esta obra do ensaio? A obra seguirá existindo en Repertorio.')) return;
      const previous = structuredClone(draft);
      draft.repertorio = draft.repertorio.filter((item) => workId(item) !== id);
      renderRepertoire();
      if (message) message.textContent = 'Gardando…';
      apiDraft('eliminarObra', { idRepertorio:id })
        .then((result) => { draft = result.draft; renderRepertoire(); if (message) message.textContent = '✓ Obra eliminada.'; })
        .catch((error) => { draft = previous; renderRepertoire(); if (message) message.textContent = `⚠ ${error.message}`; });
      return;
    }

    const saveWork = target.closest('.save-work');
    if (saveWork) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = saveWork.closest('.work-row');
      const id = row?.getAttribute('data-work-id') || '';
      const status = row?.querySelector('.save-status');
      if (!row || !id || !draft) return;
      const values = {
        idRepertorio:id,
        tipoTraballo:row.querySelector('.work-type')?.value || '',
        desde:row.querySelector('.work-from')?.value || '',
        ata:row.querySelector('.work-to')?.value || '',
        observacions:row.querySelector('.work-notes')?.value || ''
      };
      const item = draft.repertorio.find((entry) => workId(entry) === id);
      if (item) Object.assign(item, values);
      if (status) status.textContent = 'Gardando…';
      apiDraft('gardarObra', values)
        .then((result) => { draft = result.draft; if (status) status.textContent = '✓ Gardado'; })
        .catch((error) => { if (status) status.textContent = `⚠ ${error.message}`; });
      return;
    }

    const stateButton = target.closest('[data-state]');
    if (stateButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = stateButton.closest('.person-row');
      const idPersoa = row?.getAttribute('data-person') || '';
      if (!row || !idPersoa || !draft) return;
      const previous = structuredClone(draft);
      const map = new Map(draft.asistencias.map((item) => [personId(item), item]));
      map.set(idPersoa, { ensaio:currentRehearsalId, persoa:idPersoa, estadoAsistencia:stateButton.getAttribute('data-state') || '', xustificada:false, motivo:'', observacions:'' });
      draft.asistencias = [...map.values()];
      renderAttendance();
      apiDraft('gardarAsistencia', { idPersoa, estadoAsistencia:stateButton.getAttribute('data-state') || '', xustificada:false })
        .then((result) => { draft = result.draft; renderAttendance(); })
        .catch((error) => { draft = previous; renderAttendance(); window.alert(error.message); });
      return;
    }

    const finish = target.closest('#finish-rehearsal');
    if (finish) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!(finish instanceof HTMLButtonElement) || !draft || !currentRehearsalId) return;
      if (!window.confirm('Finalizar o ensaio e gardar estes datos definitivamente?')) return;
      const status = document.querySelector('#finish-rehearsal-status');
      finish.disabled = true;
      if (status) status.textContent = 'Gardando os datos…';
      apiDraft('finalizar')
        .then(async (result) => {
          draft = result.draft;
          renderDraft();
          if (status) status.textContent = '✓ Ensaio gardado definitivamente.';
          try { basePayload = await apiMain('listarEnsaiosPortal', { forzar:true }); } catch {}
        })
        .catch((error) => { if (status) status.textContent = `⚠ ${error.message}`; })
        .finally(() => { finish.disabled = false; });
    }
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof Element) || !form.matches('#program-form')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!draft) return;
    const select = document.querySelector('#program-concert-select');
    const message = document.querySelector('#program-dialog-message');
    const concertId = select instanceof HTMLSelectElement ? select.value : '';
    const concert = (basePayload?.concertos || []).find((item) => String(item.id || '') === concertId);
    if (!concert) { if (message) message.textContent = 'Escolle primeiro un concerto.'; return; }
    const existing = new Set(draft.repertorio.map(workId));
    const resolveId = (item) => {
      const direct = String(item?.idRepertorio || '').trim();
      if (direct && workById(direct)) return direct;
      const target = compactNorm(item?.obra || '');
      if (!target) return '';
      const exact = (basePayload?.repertorio || []).find((work) => compactNorm(work.nomeObra || work.nome || '') === target);
      if (exact) return String(exact.idRepertorio || exact.id || '');
      const close = (basePayload?.repertorio || []).find((work) => {
        const candidate = compactNorm(work.nomeObra || work.nome || '');
        return candidate && (candidate.includes(target) || target.includes(candidate));
      });
      return close ? String(close.idRepertorio || close.id || '') : '';
    };
    const ids = [...new Set((concert.programa || []).map(resolveId).filter((id) => id && !existing.has(id)))];
    if (!ids.length) { if (message) message.textContent = 'Non hai obras novas dese programa para incluír.'; return; }
    const previous = structuredClone(draft);
    ids.forEach((id) => draft.repertorio.push({ ensaio:currentRehearsalId, repertorio:id, orde:draft.repertorio.length + 1, tipoTraballo:'', desde:'', ata:'', observacions:'' }));
    renderRepertoire();
    if (message) message.textContent = `Gardando ${ids.length} obras…`;
    apiDraft('incluírPrograma', { idsRepertorio:ids })
      .then((result) => {
        draft = result.draft;
        renderRepertoire();
        const mainMessage = document.querySelector('#repertoire-message');
        if (mainMessage) mainMessage.textContent = `✓ ${result.engadidas || ids.length} obras incluídas.`;
        const dialog = document.querySelector('#program-dialog');
        if (dialog instanceof HTMLDialogElement) dialog.close();
      })
      .catch((error) => { draft = previous; renderRepertoire(); if (message) message.textContent = `⚠ ${error.message}`; });
  }, true);

  const observer = new MutationObserver(() => {
    installFinishButton();
    if (draft && !document.querySelector('#repertoire-list .remove-work') && (draft.repertorio || []).length) renderRepertoire();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
