(() => {
  if (window.__scppEnsaiosFinalizarV1) return;
  window.__scppEnsaiosFinalizarV1 = true;

  const fetchOriginal = window.fetch.bind(window);
  const clean = (value) => String(value ?? '').trim();
  let idToken = '';
  let activeId = '';
  let payload = null;
  let draft = null;
  let dirty = false;
  let busy = false;

  function parseRequest(input, init) {
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      let body = null;
      if (typeof init?.body === 'string') body = JSON.parse(init.body);
      return {url, body};
    } catch { return {url:null, body:null}; }
  }

  function setStatus(text, tone='') {
    const node = document.querySelector('#ensaios-final-status');
    if (!(node instanceof HTMLElement)) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }

  function setDirty(value=true) {
    dirty = value;
    const button = document.querySelector('#finalizar-ensaio');
    if (button instanceof HTMLButtonElement) button.disabled = busy || !dirty;
    setStatus(dirty ? 'Cambios gardados en R2 · pendentes de finalizar' : 'Sen cambios pendentes');
  }

  async function api(path, accion, extra={}) {
    if (!idToken) throw new Error('A sesión aínda non está preparada.');
    const response = await fetchOriginal(path, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({idToken, accion, idEnsaio:activeId, ...extra})
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
    return result;
  }

  async function loadDraft() {
    if (!activeId) return;
    const result = await api('/api/ensaios-borrador', 'obter');
    draft = result.draft || null;
    renderFromDraft();
  }

  function stateOfAttendance(row) {
    if (!row) return '';
    if (clean(row.estadoAsistencia).toLowerCase() === 'asiste') return 'asiste';
    if (clean(row.estadoAsistencia).toLowerCase() === 'non asiste') return row.xustificada === true ? 'xustificada' : 'non';
    return '';
  }

  function attendanceRow(idPersoa) {
    return (draft?.asistencias || []).find((row) => clean(row?.persoa || row?.idPersoa) === clean(idPersoa)) || null;
  }

  function baseAttendanceRow(idPersoa) {
    return (draft?.baseAsistencias || []).find((row) => clean(row?.persoa || row?.idPersoa) === clean(idPersoa)) || null;
  }

  function applyAttendanceDom() {
    document.querySelectorAll('.person-row[data-person]').forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const idPersoa = clean(row.dataset.person);
      const state = stateOfAttendance(attendanceRow(idPersoa));
      row.querySelectorAll('button[data-att]').forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) return;
        const selected = clean(button.dataset.att) === state && !!state;
        button.classList.toggle('is-selected', selected);
        button.classList.toggle('negative', selected && state === 'non');
        button.classList.toggle('justified', selected && state === 'xustificada');
      });
      const status = row.querySelector('.row-status');
      if (status instanceof HTMLElement) status.textContent = '';
    });
  }

  function workById(id) {
    return (payload?.repertorio || []).find((row) => clean(row?.idRepertorio || row?.id) === clean(id)) || null;
  }

  function esc(value) {
    return clean(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function renderWorks() {
    const box = document.querySelector('#works-list');
    const count = document.querySelector('#works-count');
    if (!(box instanceof HTMLElement)) return;
    const rows = (draft?.repertorio || []).map((row) => {
      const id = clean(row?.repertorio || row?.idRepertorio);
      const work = workById(id);
      return id && work ? {id, work} : null;
    }).filter(Boolean);
    if (count instanceof HTMLElement) count.textContent = `${rows.length} obra${rows.length === 1 ? '' : 's'}`;
    box.innerHTML = rows.length ? rows.map(({id, work}, index) => `<article class="work-row"><span class="work-order">${index+1}</span><div><strong>${esc(work.nomeObra || work.nome)}</strong>${work.compositor ? `<small>${esc(work.compositor)}</small>` : ''}</div><button type="button" class="remove-work danger" data-work-id="${esc(id)}">Eliminar</button></article>`).join('') : '<p class="empty">Aínda non hai obras asignadas a este ensaio.</p>';
  }

  function renderFromDraft() {
    applyAttendanceDom();
    renderWorks();
  }

  function ensureFinalizeUi() {
    const shell = document.querySelector('#manage-dialog .manage-shell');
    if (!(shell instanceof HTMLElement) || document.querySelector('#finalizar-ensaio')) return;
    const bar = document.createElement('div');
    bar.className = 'ensaios-final-bar';
    bar.innerHTML = '<span id="ensaios-final-status">Sen cambios pendentes</span><button type="button" id="finalizar-ensaio" class="primary" disabled>Finalizar ensaio</button>';
    shell.appendChild(bar);
  }

  async function markAttendance(button, event) {
    const row = button.closest('.person-row');
    if (!(row instanceof HTMLElement) || !activeId || !draft) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const idPersoa = clean(row.dataset.person);
    const clicked = clean(button.dataset.att);
    const current = stateOfAttendance(attendanceRow(idPersoa));
    const next = current === clicked ? '' : clicked;

    try {
      if (!next) {
        if (baseAttendanceRow(idPersoa)) {
          const status = row.querySelector('.row-status');
          if (status instanceof HTMLElement) status.textContent = 'Este estado xa está confirmado en Sheet; o borrado definitivo queda pendente da acción segura de eliminación.';
          return;
        }
        const result = await api('/api/ensaios-borrador-asistencia', 'quitar', {idPersoa});
        draft = result.draft;
      } else {
        const motivo = next === 'xustificada' ? (window.prompt('Motivo da xustificación (opcional):','') || '') : '';
        const result = await api('/api/ensaios-borrador', 'gardarAsistencia', {
          idPersoa,
          estadoAsistencia: next === 'asiste' ? 'Asiste' : 'Non asiste',
          xustificada: next === 'xustificada',
          motivo,
          observacions:''
        });
        draft = result.draft;
      }
      setDirty(true);
      applyAttendanceDom();
    } catch (error) {
      const status = row.querySelector('.row-status');
      if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  async function addWork(event) {
    const select = document.querySelector('#work-select');
    if (!(select instanceof HTMLSelectElement) || !select.value || !activeId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.querySelector('#works-status');
    try {
      if (status instanceof HTMLElement) status.textContent = 'Gardando en R2…';
      const result = await api('/api/ensaios-borrador', 'gardarObra', {idRepertorio:select.value});
      draft = result.draft;
      renderWorks();
      setDirty(true);
      if (status instanceof HTMLElement) status.textContent = 'Obra gardada en R2.';
    } catch (error) { if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : String(error); }
  }

  async function removeWork(button, event) {
    const idRepertorio = clean(button.dataset.workId);
    if (!idRepertorio || !activeId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!window.confirm('Eliminar esta obra do ensaio?')) return;
    const status = document.querySelector('#works-status');
    try {
      const result = await api('/api/ensaios-borrador', 'eliminarObra', {idRepertorio});
      draft = result.draft;
      renderWorks();
      setDirty(true);
      if (status instanceof HTMLElement) status.textContent = 'Obra eliminada do borrador R2.';
    } catch (error) { if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : String(error); }
  }

  async function includeProgram(event) {
    const select = document.querySelector('#program-concert');
    if (!(select instanceof HTMLSelectElement) || !select.value || !activeId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.querySelector('#works-status');
    try {
      if (status instanceof HTMLElement) status.textContent = 'Cargando programa en R2…';
      const result = await api('/api/ensaios-borrador', 'incluírProgramaConcerto', {idConcerto:select.value});
      draft = result.draft;
      renderWorks();
      setDirty(true);
      if (status instanceof HTMLElement) status.textContent = `Programa cargado en R2: ${Number(result.engadidas || 0)} obras.`;
    } catch (error) { if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : String(error); }
  }

  async function finalizar() {
    if (!dirty || busy || !activeId) return;
    const button = document.querySelector('#finalizar-ensaio');
    busy = true;
    if (button instanceof HTMLButtonElement) button.disabled = true;
    setStatus('Sincronizando con Sheet…');
    try {
      const result = await api('/api/ensaios-borrador', 'finalizar');
      draft = result.draft || draft;
      setDirty(false);
      setStatus('Ensaio finalizado e sincronizado con Sheet');
      await fetchOriginal('/api/ensaios', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({idToken, accion:'listarEnsaiosPortal', forzar:true})
      }).catch(() => null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error');
      if (button instanceof HTMLButtonElement) button.disabled = false;
    } finally { busy = false; }
  }

  window.fetch = async (input, init) => {
    const {url, body} = parseRequest(input, init);
    if (body?.idToken) idToken = clean(body.idToken);
    const response = await fetchOriginal(input, init);
    if (url?.pathname === '/api/ensaios' && body?.accion === 'listarEnsaiosPortal' && response.ok) {
      response.clone().json().then((data) => { if (data?.ok) payload = data; }).catch(() => {});
    }
    return response;
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const manage = target.closest('button.manage[data-id]');
    if (manage instanceof HTMLButtonElement) {
      activeId = clean(manage.dataset.id);
      dirty = false;
      setTimeout(async () => {
        ensureFinalizeUi();
        try { await loadDraft(); setDirty(false); } catch (error) { setStatus(error instanceof Error ? error.message : String(error), 'error'); }
      }, 0);
      return;
    }

    const att = target.closest('button[data-att]');
    if (att instanceof HTMLButtonElement && att.closest('#attendance-list')) { void markAttendance(att, event); return; }
    if (target.closest('#add-work')) { void addWork(event); return; }
    const remove = target.closest('button.remove-work[data-work-id]');
    if (remove instanceof HTMLButtonElement) { void removeWork(remove, event); return; }
    if (target.closest('#include-program')) { void includeProgram(event); return; }
    if (target.closest('#finalizar-ensaio')) { event.preventDefault(); event.stopImmediatePropagation(); void finalizar(); }
  }, true);

  const style = document.createElement('style');
  style.textContent = '.ensaios-final-bar{position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1rem;padding:.85rem 1rem;border-top:1px solid #ded8d3;background:#fff;z-index:4}.ensaios-final-bar span{font-size:.85rem;color:#6f6561}.ensaios-final-bar span[data-tone="error"]{color:#8e3440}@media(max-width:640px){.ensaios-final-bar{flex-direction:column;align-items:stretch}.ensaios-final-bar button{width:100%}}';
  document.head.appendChild(style);
})();
