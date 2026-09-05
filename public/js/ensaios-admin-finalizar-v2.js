(() => {
  if (window.__scppEnsaiosFinalizarV2) return;
  window.__scppEnsaiosFinalizarV2 = true;

  const fetchOriginal = window.fetch.bind(window);
  const clean = (v) => String(v ?? '').trim();
  let idToken = '';
  let activeId = '';
  let payload = null;
  let draft = null;
  let busy = false;

  function parseRequest(input, init) {
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      let body = null;
      if (typeof init?.body === 'string') body = JSON.parse(init.body);
      return { url, body };
    } catch { return { url:null, body:null }; }
  }

  function setStatus(text, tone='') {
    const node = document.querySelector('#ensaios-final-status');
    if (!(node instanceof HTMLElement)) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }
  function updateFinalState() {
    const dirty = draft?.dirty === true;
    const button = document.querySelector('#finalizar-ensaio');
    if (button instanceof HTMLButtonElement) button.disabled = busy || !dirty;
    setStatus(dirty ? 'Cambios gardados en R2 · pendentes de finalizar' : 'Sen cambios pendentes');
  }

  async function api(accion, extra={}) {
    if (!idToken) throw new Error('A sesión aínda non está preparada.');
    const response = await fetchOriginal('/api/ensaios-admin-xestion', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ idToken, accion, idEnsaio:activeId, ...extra })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
    return result;
  }

  function state(row) {
    if (!row) return '';
    if (clean(row.estadoAsistencia).toLowerCase() === 'asiste') return 'asiste';
    if (clean(row.estadoAsistencia).toLowerCase() === 'non asiste') return row.xustificada === true ? 'xustificada' : 'non';
    return '';
  }
  function attendance(id) {
    return (draft?.asistencias || []).find(r => clean(r?.persoa || r?.idPersoa) === clean(id)) || null;
  }
  function applyAttendance() {
    document.querySelectorAll('.person-row[data-person]').forEach(row => {
      if (!(row instanceof HTMLElement)) return;
      const current = state(attendance(row.dataset.person));
      row.querySelectorAll('button[data-att]').forEach(button => {
        if (!(button instanceof HTMLButtonElement)) return;
        const selected = clean(button.dataset.att) === current && !!current;
        button.classList.toggle('is-selected', selected);
        button.classList.toggle('negative', selected && current === 'non');
        button.classList.toggle('justified', selected && current === 'xustificada');
      });
      const status = row.querySelector('.row-status');
      if (status instanceof HTMLElement) status.textContent = '';
    });
  }

  function workById(id) {
    return (payload?.repertorio || []).find(r => clean(r?.idRepertorio || r?.id) === clean(id)) || null;
  }
  function esc(v) {
    return clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }
  function renderWorks() {
    const box = document.querySelector('#works-list');
    const count = document.querySelector('#works-count');
    if (!(box instanceof HTMLElement)) return;
    const rows = (draft?.repertorio || []).map(row => {
      const id = clean(row?.repertorio || row?.idRepertorio);
      const work = workById(id);
      return id && work ? { id, work } : null;
    }).filter(Boolean);
    if (count instanceof HTMLElement) count.textContent = `${rows.length} obra${rows.length === 1 ? '' : 's'}`;
    box.innerHTML = rows.length ? rows.map(({id,work},i) => `<article class="work-row"><span class="work-order">${i+1}</span><div><strong>${esc(work.nomeObra || work.nome)}</strong>${work.compositor ? `<small>${esc(work.compositor)}</small>` : ''}</div><button type="button" class="remove-work danger" data-work-id="${esc(id)}">Eliminar</button></article>`).join('') : '<p class="empty">Aínda non hai obras asignadas a este ensaio.</p>';
  }
  function renderDraft() { applyAttendance(); renderWorks(); updateFinalState(); }

  function ensureUi() {
    const shell = document.querySelector('#manage-dialog .manage-shell');
    if (!(shell instanceof HTMLElement) || document.querySelector('#finalizar-ensaio')) return;
    const bar = document.createElement('div');
    bar.className = 'ensaios-final-bar';
    bar.innerHTML = '<span id="ensaios-final-status">Cargando estado confirmado…</span><div class="ensaios-final-actions"><button type="button" id="descartar-ensaio">Recargar desde Sheet</button><button type="button" id="finalizar-ensaio" class="primary" disabled>Finalizar ensaio</button></div>';
    shell.appendChild(bar);
  }

  async function load() {
    if (!activeId) return;
    setStatus('Comprobando estado confirmado en Sheet…');
    const result = await api('obterXestion', { refrescarBase:true });
    draft = result.draft || null;
    renderDraft();
  }

  async function mark(button, event) {
    const row = button.closest('.person-row');
    if (!(row instanceof HTMLElement) || !activeId || !draft || busy) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const person = clean(row.dataset.person);
    const clicked = clean(button.dataset.att);
    const current = state(attendance(person));
    const next = current === clicked ? '' : clicked;
    const status = row.querySelector('.row-status');
    try {
      let result;
      if (!next) result = await api('quitarAsistencia', { idPersoa:person });
      else {
        const motivo = next === 'xustificada' ? (window.prompt('Motivo da xustificación (opcional):','') || '') : '';
        result = await api('gardarAsistencia', {
          idPersoa:person,
          estadoAsistencia:next === 'asiste' ? 'Asiste' : 'Non asiste',
          xustificada:next === 'xustificada', motivo, observacions:''
        });
      }
      draft = result.draft;
      applyAttendance(); updateFinalState();
      if (status instanceof HTMLElement) status.textContent = 'Gardado en R2';
    } catch (error) { if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : String(error); }
  }

  async function addWork(event) {
    const select = document.querySelector('#work-select');
    if (!(select instanceof HTMLSelectElement) || !select.value || !activeId || busy) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const status = document.querySelector('#works-status');
    try {
      if (status instanceof HTMLElement) status.textContent = 'Gardando en R2…';
      const result = await api('gardarObra', { idRepertorio:select.value });
      draft = result.draft; renderWorks(); updateFinalState();
      if (status instanceof HTMLElement) status.textContent = 'Obra gardada en R2.';
    } catch (error) { if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : String(error); }
  }
  async function removeWork(button,event) {
    const rid = clean(button.dataset.workId); if (!rid || !activeId || busy) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!window.confirm('Eliminar esta obra do ensaio?')) return;
    const status = document.querySelector('#works-status');
    try {
      const result = await api('eliminarObra',{idRepertorio:rid});
      draft = result.draft; renderWorks(); updateFinalState();
      if (status instanceof HTMLElement) status.textContent = 'Obra eliminada do borrador R2.';
    } catch (error) { if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : String(error); }
  }
  async function includeProgram(event) {
    const select = document.querySelector('#program-concert');
    if (!(select instanceof HTMLSelectElement) || !select.value || !activeId || busy) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const status = document.querySelector('#works-status');
    try {
      if (status instanceof HTMLElement) status.textContent = 'Cargando programa en R2…';
      const result = await api('incluírProgramaConcerto',{idConcerto:select.value});
      draft = result.draft; renderWorks(); updateFinalState();
      if (status instanceof HTMLElement) status.textContent = `Programa cargado en R2: ${Number(result.engadidas || 0)} obras.`;
    } catch (error) { if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : String(error); }
  }

  async function finalizar() {
    if (draft?.dirty !== true || busy || !activeId) return;
    busy = true; updateFinalState(); setStatus('Sincronizando con Sheet…');
    try {
      const result = await api('finalizar');
      draft = result.draft || draft;
      renderDraft();
      setStatus('Ensaio finalizado e sincronizado con Sheet');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error),'error');
    } finally { busy = false; updateFinalState(); }
  }
  async function descartar() {
    if (busy || !activeId) return;
    if (draft?.dirty === true && !window.confirm('Descartar os cambios pendentes en R2 e recargar o estado actual da Sheet?')) return;
    busy = true; updateFinalState(); setStatus('Recargando desde Sheet…');
    try {
      const result = await api('descartar');
      draft = result.draft; renderDraft();
      setStatus('Estado actualizado desde Sheet');
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error),'error'); }
    finally { busy=false; updateFinalState(); }
  }

  window.fetch = async (input,init) => {
    const {url,body} = parseRequest(input,init);
    if (body?.idToken) idToken = clean(body.idToken);
    const response = await fetchOriginal(input,init);
    if (url?.pathname === '/api/ensaios' && body?.accion === 'listarEnsaiosPortal' && response.ok) {
      response.clone().json().then(data => { if (data?.ok) payload=data; }).catch(()=>{});
    }
    return response;
  };

  document.addEventListener('click', event => {
    const target = event.target; if (!(target instanceof HTMLElement)) return;
    const manage = target.closest('button.manage[data-id]');
    if (manage instanceof HTMLButtonElement) {
      activeId = clean(manage.dataset.id); draft=null;
      setTimeout(async()=>{ ensureUi(); try { await load(); } catch(error){ setStatus(error instanceof Error ? error.message : String(error),'error'); } },0);
      return;
    }
    const att = target.closest('button[data-att]');
    if (att instanceof HTMLButtonElement && att.closest('#attendance-list')) { void mark(att,event); return; }
    if (target.closest('#add-work')) { void addWork(event); return; }
    const remove = target.closest('button.remove-work[data-work-id]');
    if (remove instanceof HTMLButtonElement) { void removeWork(remove,event); return; }
    if (target.closest('#include-program')) { void includeProgram(event); return; }
    if (target.closest('#finalizar-ensaio')) { event.preventDefault(); event.stopImmediatePropagation(); void finalizar(); return; }
    if (target.closest('#descartar-ensaio')) { event.preventDefault(); event.stopImmediatePropagation(); void descartar(); }
  }, true);

  const style=document.createElement('style');
  style.textContent='.ensaios-final-bar{position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1rem;padding:.85rem 1rem;border-top:1px solid #ded8d3;background:#fff;z-index:4}.ensaios-final-actions{display:flex;gap:.6rem}.ensaios-final-bar span{font-size:.85rem;color:#6f6561}.ensaios-final-bar span[data-tone="error"]{color:#8e3440}@media(max-width:640px){.ensaios-final-bar{flex-direction:column;align-items:stretch}.ensaios-final-actions{flex-direction:column}.ensaios-final-actions button{width:100%}}';
  document.head.appendChild(style);
})();