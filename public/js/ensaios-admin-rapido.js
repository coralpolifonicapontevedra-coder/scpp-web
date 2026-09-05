(() => {
  if (window.__scppEnsaiosRapidoV1) return;
  window.__scppEnsaiosRapidoV1 = true;

  const fetchOriginal = window.fetch.bind(window);
  const clean = (value) => String(value ?? '').trim();
  const norm = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  let idToken = '';
  let activeRehearsalId = '';
  let cachedPayload = null;
  let draftReadyFor = '';
  let mutationChain = Promise.resolve();
  let finalizeTimer = 0;
  let finalizing = false;
  let pendingChanges = false;
  const initialAttendance = new Map();
  const pendingAttendance = new Map();

  function parseRequest(input, init) {
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, window.location.href);
      let body = null;
      if (typeof init?.body === 'string') body = JSON.parse(init.body);
      return { url, body };
    } catch {
      return { url: null, body: null };
    }
  }

  function responseJson(body, headers = {}) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        ...headers
      }
    });
  }

  function rememberToken(body) {
    const token = clean(body?.idToken);
    if (token) idToken = token;
  }

  function attendanceKey(idEnsaio, idPersoa) {
    return `${clean(idEnsaio)}|${clean(idPersoa)}`;
  }

  function attendanceStateFromRow(row) {
    const buttons = Array.from(row.querySelectorAll('button[data-att]'));
    const selected = buttons.find((button) => button.classList.contains('is-selected'));
    return clean(selected?.dataset.att);
  }

  function applyAttendanceState(row, state) {
    row.querySelectorAll('button[data-att]').forEach((button) => {
      const selected = clean(button.dataset.att) === clean(state) && clean(state) !== '';
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('negative', selected && state === 'non');
      button.classList.toggle('justified', selected && state === 'xustificada');
    });
    const status = row.querySelector('.row-status');
    if (status instanceof HTMLElement) {
      status.textContent = state ? 'Pendiente de sincronizar…' : '';
      status.dataset.rapidoPending = state ? '1' : '';
    }
  }

  function currentActiveRehearsal() {
    return activeRehearsalId;
  }

  function draftCall(accion, extra = {}, options = {}) {
    if (!idToken) return Promise.reject(new Error('A sesión aínda non está preparada.'));
    const idEnsaio = clean(options.idEnsaio || currentActiveRehearsal());
    if (!idEnsaio) return Promise.reject(new Error('Falta identificar o ensaio.'));
    return fetchOriginal('/api/ensaios-borrador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, accion, idEnsaio, ...extra }),
      keepalive: options.keepalive === true
    }).then(async (response) => {
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
      return result;
    });
  }

  async function ensureDraft(idEnsaio) {
    const id = clean(idEnsaio);
    if (!id) throw new Error('Falta identificar o ensaio.');
    if (draftReadyFor === id) return;
    await draftCall('reiniciar', {}, { idEnsaio: id });
    draftReadyFor = id;
  }

  function enqueueMutation(task) {
    mutationChain = mutationChain.then(task, task);
    return mutationChain;
  }

  function scheduleFinalize(delay = 1800) {
    pendingChanges = true;
    window.clearTimeout(finalizeTimer);
    finalizeTimer = window.setTimeout(() => {
      void finalizePending();
    }, delay);
  }

  async function refreshServerCacheQuietly() {
    if (!idToken) return;
    try {
      await fetchOriginal('/api/ensaios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, accion: 'listarEnsaiosPortal', forzar: true })
      });
    } catch {}
  }

  async function finalizePending(options = {}) {
    if (!pendingChanges || finalizing || !currentActiveRehearsal()) return;
    finalizing = true;
    window.clearTimeout(finalizeTimer);
    try {
      await mutationChain;
      const result = await draftCall('finalizar', {}, { keepalive: options.keepalive === true });
      pendingChanges = false;
      if (result?.draft) patchCachedPayloadFromDraft(result.draft);
      document.querySelectorAll('[data-rapido-pending="1"]').forEach((node) => {
        if (node instanceof HTMLElement) {
          node.textContent = 'Gardado';
          node.dataset.rapidoPending = '';
        }
      });
      void refreshServerCacheQuietly();
    } catch (error) {
      document.querySelectorAll('[data-rapido-pending="1"]').forEach((node) => {
        if (node instanceof HTMLElement) node.textContent = error instanceof Error ? error.message : 'Erro ao sincronizar';
      });
    } finally {
      finalizing = false;
      if (pendingChanges) scheduleFinalize(1200);
    }
  }

  function patchCachedPayloadFromDraft(draft) {
    if (!cachedPayload || !draft?.idEnsaio) return;
    const idEnsaio = clean(draft.idEnsaio);
    const repertorio = Array.isArray(draft.repertorio) ? draft.repertorio : [];
    const asistencias = Array.isArray(draft.asistencias) ? draft.asistencias : [];
    cachedPayload = {
      ...cachedPayload,
      ensaiosRepertorio: (Array.isArray(cachedPayload.ensaiosRepertorio) ? cachedPayload.ensaiosRepertorio : [])
        .filter((row) => clean(row?.ensaio || row?.idEnsaio) !== idEnsaio)
        .concat(repertorio.map((row, index) => ({
          idEnsaioRepertorio: '',
          ensaio: idEnsaio,
          repertorio: clean(row?.repertorio || row?.idRepertorio),
          orde: Number(row?.orde) || index + 1,
          tipoTraballo: clean(row?.tipoTraballo),
          desde: clean(row?.desde),
          ata: clean(row?.ata),
          observacions: clean(row?.observacions)
        })).filter((row) => row.repertorio)),
      asistencias: (Array.isArray(cachedPayload.asistencias) ? cachedPayload.asistencias : [])
        .filter((row) => clean(row?.ensaio || row?.idEnsaio) !== idEnsaio)
        .concat(asistencias.map((row) => ({
          idAsistenciaEnsaio: '',
          ensaio: idEnsaio,
          persoa: clean(row?.persoa || row?.idPersoa),
          estadoAsistencia: clean(row?.estadoAsistencia),
          xustificada: row?.xustificada === true,
          motivo: clean(row?.motivo),
          observacions: clean(row?.observacions)
        })).filter((row) => row.persoa))
    };
  }

  function workCatalog() {
    return Array.isArray(cachedPayload?.repertorio) ? cachedPayload.repertorio : [];
  }

  function workById(id) {
    const target = clean(id);
    return workCatalog().find((work) => clean(work?.idRepertorio || work?.id) === target) || null;
  }

  function renderWorksFromDraft(draft) {
    const box = document.querySelector('#works-list');
    const count = document.querySelector('#works-count');
    if (!(box instanceof HTMLElement)) return;
    const rows = Array.isArray(draft?.repertorio) ? draft.repertorio : [];
    const valid = rows.map((row, index) => {
      const id = clean(row?.repertorio || row?.idRepertorio);
      const work = workById(id);
      const title = clean(work?.nomeObra || work?.nome);
      if (!id || !title || /^\d+$/.test(title)) return null;
      return { id, work, index };
    }).filter(Boolean);
    if (count instanceof HTMLElement) count.textContent = `${valid.length} obra${valid.length === 1 ? '' : 's'}`;
    box.innerHTML = valid.length
      ? valid.map(({ id, work }, index) => `<article class="work-row"><span class="work-order">${index + 1}</span><div><strong>${escapeHtml(clean(work.nomeObra || work.nome))}</strong>${work.compositor ? `<small>${escapeHtml(clean(work.compositor))}</small>` : ''}</div><button type="button" class="remove-work danger" data-work-id="${escapeHtml(id)}">Eliminar</button></article>`).join('')
      : '<p class="empty">Aínda non hai obras asignadas a este ensaio.</p>';
  }

  function escapeHtml(value) {
    return clean(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function syncAttendanceDomFromPending() {
    const id = currentActiveRehearsal();
    if (!id) return;
    document.querySelectorAll('.person-row[data-person]').forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const key = attendanceKey(id, row.dataset.person);
      if (!pendingAttendance.has(key)) return;
      applyAttendanceState(row, pendingAttendance.get(key) || '');
    });
  }

  function rememberInitialAttendance() {
    const id = currentActiveRehearsal();
    if (!id) return;
    document.querySelectorAll('.person-row[data-person]').forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const key = attendanceKey(id, row.dataset.person);
      if (!initialAttendance.has(key)) initialAttendance.set(key, attendanceStateFromRow(row));
    });
  }

  async function handleAttendanceClick(event, button) {
    const row = button.closest('.person-row');
    if (!(row instanceof HTMLElement)) return;
    const idEnsaio = currentActiveRehearsal();
    const idPersoa = clean(row.dataset.person);
    if (!idEnsaio || !idPersoa || !idToken) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    rememberInitialAttendance();
    const key = attendanceKey(idEnsaio, idPersoa);
    const initial = initialAttendance.get(key) || '';
    const current = pendingAttendance.has(key) ? (pendingAttendance.get(key) || '') : attendanceStateFromRow(row);
    const clicked = clean(button.dataset.att);
    let next = current === clicked ? '' : clicked;

    // Un estado que xa existía antes de abrir a xestión non se elimina da Sheet
    // desde esta capa web porque a acción viva de Apps Script non dispón aínda de borrado.
    // Evitamos crear un estado falso: só permitimos volver a neutro se ese estado naceu nesta edición.
    if (!next && initial && !pendingAttendance.has(key)) {
      const status = row.querySelector('.row-status');
      if (status instanceof HTMLElement) status.textContent = 'Este estado xa estaba gardado; non se borrou.';
      return;
    }

    if (!next && initial && pendingAttendance.has(key) && initial === current) {
      const status = row.querySelector('.row-status');
      if (status instanceof HTMLElement) status.textContent = 'Este estado xa estaba gardado; non se borrou.';
      return;
    }

    pendingAttendance.set(key, next);
    applyAttendanceState(row, next);

    // Se partía de neutro e se volve a neutro antes de sincronizar, non se crea rexistro ningún.
    if (!next && !initial) {
      pendingAttendance.delete(key);
      applyAttendanceState(row, '');
      return;
    }

    const motivo = next === 'xustificada' ? (window.prompt('Motivo da xustificación (opcional):', '') || '') : '';
    enqueueMutation(async () => {
      await ensureDraft(idEnsaio);
      const result = await draftCall('gardarAsistencia', {
        idPersoa,
        estadoAsistencia: next === 'asiste' ? 'Asiste' : 'Non asiste',
        xustificada: next === 'xustificada',
        motivo,
        observacions: ''
      }, { idEnsaio });
      if (result?.draft) patchCachedPayloadFromDraft(result.draft);
    });
    scheduleFinalize();
  }

  async function handleAddWork(event) {
    const select = document.querySelector('#work-select');
    const status = document.querySelector('#works-status');
    const idEnsaio = currentActiveRehearsal();
    if (!(select instanceof HTMLSelectElement) || !select.value || !idEnsaio || !idToken) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const idRepertorio = clean(select.value);
    if (status instanceof HTMLElement) status.textContent = 'Engadindo…';
    enqueueMutation(async () => {
      await ensureDraft(idEnsaio);
      const result = await draftCall('gardarObra', { idRepertorio }, { idEnsaio });
      if (result?.draft) {
        patchCachedPayloadFromDraft(result.draft);
        renderWorksFromDraft(result.draft);
      }
      if (status instanceof HTMLElement) status.textContent = 'Obra engadida. Sincronizando…';
    });
    scheduleFinalize();
  }

  async function handleRemoveWork(event, button) {
    const idEnsaio = currentActiveRehearsal();
    const idRepertorio = clean(button.dataset.workId);
    const status = document.querySelector('#works-status');
    if (!idEnsaio || !idRepertorio || !idToken) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!window.confirm('Eliminar esta obra do ensaio?')) return;
    button.disabled = true;
    if (status instanceof HTMLElement) status.textContent = 'Eliminando obra…';
    enqueueMutation(async () => {
      await ensureDraft(idEnsaio);
      const result = await draftCall('eliminarObra', { idRepertorio }, { idEnsaio });
      if (result?.draft) {
        patchCachedPayloadFromDraft(result.draft);
        renderWorksFromDraft(result.draft);
      }
      if (status instanceof HTMLElement) status.textContent = 'Obra eliminada. Sincronizando…';
    });
    scheduleFinalize();
  }

  async function handleIncludeProgram(event) {
    const idEnsaio = currentActiveRehearsal();
    const select = document.querySelector('#program-concert');
    const status = document.querySelector('#works-status');
    if (!(select instanceof HTMLSelectElement) || !select.value || !idEnsaio || !idToken) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (status instanceof HTMLElement) status.textContent = 'Incluíndo programa…';
    enqueueMutation(async () => {
      await ensureDraft(idEnsaio);
      const result = await draftCall('incluírProgramaConcerto', { idConcerto: select.value }, { idEnsaio });
      if (result?.draft) {
        patchCachedPayloadFromDraft(result.draft);
        renderWorksFromDraft(result.draft);
      }
      if (status instanceof HTMLElement) status.textContent = `Programa cargado: ${Number(result?.engadidas || 0)} obras. Sincronizando…`;
    });
    scheduleFinalize();
  }

  window.fetch = async (input, init) => {
    const { url, body } = parseRequest(input, init);
    rememberToken(body);

    if (url?.pathname === '/api/ensaios-borrador' && clean(body?.idEnsaio)) {
      activeRehearsalId = clean(body.idEnsaio);
      if (body?.accion === 'reiniciar') draftReadyFor = activeRehearsalId;
    }

    if (url?.pathname === '/api/ensaios' && body?.accion === 'listarEnsaiosPortal') {
      const response = await fetchOriginal(input, init);
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data?.ok && Array.isArray(data.ensaios)) cachedPayload = data;
      } catch {}
      return response;
    }

    return fetchOriginal(input, init);
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const attendanceButton = target.closest('#attendance-list button[data-att]');
    if (attendanceButton instanceof HTMLButtonElement) {
      void handleAttendanceClick(event, attendanceButton);
      return;
    }

    const addWork = target.closest('#add-work');
    if (addWork instanceof HTMLButtonElement) {
      void handleAddWork(event);
      return;
    }

    const removeWork = target.closest('#works-list .remove-work');
    if (removeWork instanceof HTMLButtonElement) {
      void handleRemoveWork(event, removeWork);
      return;
    }

    const includeProgram = target.closest('#include-program');
    if (includeProgram instanceof HTMLButtonElement) {
      void handleIncludeProgram(event);
      return;
    }

    const voice = target.closest('[data-voice]');
    if (voice instanceof HTMLButtonElement) {
      window.setTimeout(syncAttendanceDomFromPending, 0);
      return;
    }

    const close = target.closest('[data-close="manage-dialog"]');
    if (close instanceof HTMLButtonElement && pendingChanges) {
      window.clearTimeout(finalizeTimer);
      void finalizePending();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.querySelector('#manage-dialog');
    if (dialog instanceof HTMLDialogElement) {
      dialog.addEventListener('close', () => {
        if (pendingChanges) void finalizePending();
        activeRehearsalId = '';
        draftReadyFor = '';
        initialAttendance.clear();
        pendingAttendance.clear();
      });
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pendingChanges) void finalizePending({ keepalive: true });
  });
})();
