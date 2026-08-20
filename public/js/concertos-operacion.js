const SCPP_CONCERTOS_OPERACION_API = '/api/concertos-operacion';

let operacionActual = null;
let concertoActualId = '';
let panelOperacion = null;
let editando = '';

const escaparOp = (v='') => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

async function tokenOperacion() {
  const [{ getAuth }, appMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js')
  ]);
  const config = {
    apiKey:'AIzaSyDrQY7NsaKpBfrSc8GqV3lUQDOIkecPZbs',
    authDomain:'scpp-portal-privado.firebaseapp.com',
    projectId:'scpp-portal-privado',
    storageBucket:'scpp-portal-privado.firebasestorage.app',
    messagingSenderId:'506857659587',
    appId:'1:506857659587:web:a7ed36b22f044f5f639676'
  };
  const app = appMod.getApps()[0] || appMod.initializeApp(config);
  const user = getAuth(app).currentUser;
  if (!user) throw new Error('A sesión non está dispoñible');
  return user.getIdToken();
}

async function chamarOperacion(accion, datos={}) {
  const idToken = await tokenOperacion();
  const r = await fetch(SCPP_CONCERTOS_OPERACION_API, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ idToken, accion, idConcerto:concertoActualId, ...datos })
  });
  const out = await r.json().catch(() => null);
  if (!r.ok || !out?.ok) {
    const err = new Error(out?.erro || 'Non foi posible completar a operación.');
    err.status = r.status;
    throw err;
  }
  return out;
}

function prepararPanelOperacion() {
  if (panelOperacion instanceof HTMLElement) return panelOperacion;
  const dialogo = document.querySelector('#dialogo');
  if (!(dialogo instanceof HTMLDialogElement)) return null;
  const body = dialogo.querySelector('.concert-dialog-body') || dialogo;
  const panel = document.createElement('section');
  panel.id = 'concert-management';
  panel.className = 'concert-management';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="concert-management-head">
      <div><span>Administración</span><strong>Xestionar concerto</strong></div>
      <div class="concert-management-actions">
        <button type="button" data-op="programa">Programa</button>
        <button type="button" data-op="asistentes">Asistentes</button>
      </div>
    </div>
    <div id="concert-management-status" class="concert-management-status" hidden></div>
    <div id="concert-management-editor" class="concert-management-editor" hidden></div>`;
  body.prepend(panel);
  panelOperacion = panel;
  panel.addEventListener('click', eventoPanelOperacion);
  return panel;
}

function estadoPanel(texto, tipo='info') {
  const el = panelOperacion?.querySelector('#concert-management-status');
  if (!(el instanceof HTMLElement)) return;
  el.hidden = !texto;
  el.dataset.tipo = tipo;
  el.textContent = texto || '';
}

function editorPanel() {
  return panelOperacion?.querySelector('#concert-management-editor');
}

function pecharEditor() {
  editando = '';
  const editor = editorPanel();
  if (editor instanceof HTMLElement) {
    editor.hidden = true;
    editor.innerHTML = '';
  }
  panelOperacion?.querySelectorAll('[data-op]').forEach((b) => b.classList.remove('is-active'));
}

function mapaRepertorio() {
  return new Map((operacionActual?.repertorio || []).map((o) => [String(o.idRepertorio), o]));
}

function pintarProgramaEditor() {
  const editor = editorPanel();
  if (!(editor instanceof HTMLElement) || !operacionActual) return;
  const mapa = mapaRepertorio();
  const programa = Array.isArray(operacionActual.programa) ? operacionActual.programa : [];
  const usados = new Set(programa.map((i) => String(i.idRepertorio)));
  const dispo = (operacionActual.repertorio || []).filter((o) => !usados.has(String(o.idRepertorio)));
  editor.hidden = false;
  editor.innerHTML = `
    <div class="editor-toolbar">
      <label>Engadir obra
        <select id="op-add-work"><option value="">Seleccionar…</option>${dispo.map((o) => `<option value="${escaparOp(o.idRepertorio)}">${escaparOp(o.nome)}${o.autor ? ` — ${escaparOp(o.autor)}` : ''}</option>`).join('')}</select>
      </label>
      <button type="button" data-editor-action="engadir-programa">Engadir</button>
    </div>
    <ol class="op-program-list">${programa.map((item, indice) => {
      const obra = mapa.get(String(item.idRepertorio)) || { nome:item.idRepertorio, autor:'' };
      return `<li data-program-id="${escaparOp(item.idRepertorio)}">
        <span class="op-order">${indice + 1}</span>
        <div class="op-work"><strong>${escaparOp(obra.nome)}</strong><small>${escaparOp(obra.autor || '')}</small>
          <div class="op-work-fields"><input data-field="solista" value="${escaparOp(item.solista || '')}" placeholder="Solista (opcional)"><input data-field="notas" value="${escaparOp(item.notas || '')}" placeholder="Notas (opcional)"></div>
        </div>
        <div class="op-row-actions"><button type="button" data-editor-action="subir" aria-label="Subir">↑</button><button type="button" data-editor-action="baixar" aria-label="Baixar">↓</button><button type="button" data-editor-action="retirar" aria-label="Retirar">×</button></div>
      </li>`;
    }).join('')}</ol>
    <div class="editor-footer"><button type="button" data-editor-action="cancelar">Cancelar</button><button class="primary" type="button" data-editor-action="gardar-programa">Gardar programa</button></div>`;
}

function ordeVoz(voz) {
  return ({Soprano:1,Contralto:2,Tenor:3,Baixo:4})[voz] || 99;
}

function pintarAsistentesEditor() {
  const editor = editorPanel();
  if (!(editor instanceof HTMLElement) || !operacionActual) return;
  const seleccionados = new Set((operacionActual.asistentes || []).map(String));
  const grupos = new Map();
  (operacionActual.persoas || []).forEach((p) => {
    const voz = p.voz || 'Sen voz indicada';
    if (!grupos.has(voz)) grupos.set(voz, []);
    grupos.get(voz).push(p);
  });
  const voces = [...grupos.keys()].sort((a,b) => ordeVoz(a) - ordeVoz(b) || a.localeCompare(b,'gl'));
  editor.hidden = false;
  editor.innerHTML = `
    <div class="attendance-editor-head"><span>Marca as persoas que asistirán ao concerto. Os cambios gárdanse todos xuntos.</span><strong id="op-att-count">${seleccionados.size} seleccionadas</strong></div>
    <div class="op-att-groups">${voces.map((voz) => `<section><h4>${escaparOp(voz)} <span>${grupos.get(voz).length}</span></h4><div>${grupos.get(voz).map((p) => `<label><input type="checkbox" data-person-id="${escaparOp(p.idPersoa)}" ${seleccionados.has(String(p.idPersoa)) ? 'checked' : ''}><span>${escaparOp(p.nome)}</span></label>`).join('')}</div></section>`).join('')}</div>
    <div class="editor-footer"><button type="button" data-editor-action="cancelar">Cancelar</button><button class="primary" type="button" data-editor-action="gardar-asistentes">Gardar asistentes</button></div>`;
  editor.querySelectorAll('[data-person-id]').forEach((cb) => cb.addEventListener('change', () => {
    const n = editor.querySelectorAll('[data-person-id]:checked').length;
    const c = editor.querySelector('#op-att-count');
    if (c) c.textContent = `${n} seleccionadas`;
  }));
}

function lerProgramaEditor() {
  const editor = editorPanel();
  if (!(editor instanceof HTMLElement)) return [];
  return [...editor.querySelectorAll('[data-program-id]')].map((li) => ({
    idRepertorio:String(li.getAttribute('data-program-id') || ''),
    solista:String(li.querySelector('[data-field="solista"]')?.value || '').trim(),
    notas:String(li.querySelector('[data-field="notas"]')?.value || '').trim()
  })).filter((i) => i.idRepertorio);
}

function actualizarProgramaDialogo() {
  if (!operacionActual) return;
  const mapa = mapaRepertorio();
  const lista = document.querySelector('#programa');
  const count = document.querySelector('#contador-programa');
  const baleiro = document.querySelector('#programa-baleiro');
  const programa = operacionActual.programa || [];
  if (lista instanceof HTMLOListElement) lista.innerHTML = programa.map((item) => {
    const o = mapa.get(String(item.idRepertorio)) || { nome:item.idRepertorio, autor:'' };
    return `<li><span><strong>${escaparOp(o.nome)}</strong><small>${escaparOp(o.autor || '')}</small>${item.solista ? `<small>Solista: ${escaparOp(item.solista)}</small>` : ''}</span></li>`;
  }).join('');
  if (count) count.textContent = `${programa.length} obra${programa.length === 1 ? '' : 's'}`;
  if (baleiro instanceof HTMLElement) baleiro.hidden = programa.length > 0;
  const card = document.querySelector(`.concert-square[data-id="${CSS.escape(concertoActualId)}"]`);
  const obras = card?.querySelector('.classic-card-meta span:first-child');
  if (obras) obras.textContent = `${programa.length} obra${programa.length === 1 ? '' : 's'}`;
}

function actualizarAsistentesDialogo() {
  if (!operacionActual) return;
  const ids = new Set((operacionActual.asistentes || []).map(String));
  const persoas = (operacionActual.persoas || []).filter((p) => ids.has(String(p.idPersoa)));
  const grupos = document.querySelector('#grupos-asistentes');
  const count = document.querySelector('#contador-asistentes');
  const baleiro = document.querySelector('#sen-asistentes');
  const porVoz = new Map();
  persoas.forEach((p) => { const v=p.voz||'Sen voz indicada'; if(!porVoz.has(v)) porVoz.set(v,[]); porVoz.get(v).push(p); });
  if (grupos instanceof HTMLElement) grupos.innerHTML = [...porVoz.keys()].sort((a,b)=>ordeVoz(a)-ordeVoz(b)||a.localeCompare(b,'gl')).map((voz) => `<section class="voice-group"><h3>${escaparOp(voz)} <span>${porVoz.get(voz).length}</span></h3><ul>${porVoz.get(voz).map((p)=>`<li>${escaparOp(p.nome)}</li>`).join('')}</ul></section>`).join('');
  if (count) count.textContent = `${persoas.length} persoas`;
  if (baleiro instanceof HTMLElement) baleiro.hidden = persoas.length > 0;
  const card = document.querySelector(`.concert-square[data-id="${CSS.escape(concertoActualId)}"]`);
  const spans = card?.querySelectorAll('.classic-card-meta span');
  const asistentes = spans?.[spans.length - 1];
  if (asistentes) asistentes.textContent = `${persoas.length} asistentes`;
}

async function eventoPanelOperacion(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const op = target.closest('[data-op]');
  if (op instanceof HTMLButtonElement) {
    const tipo = op.dataset.op || '';
    editando = tipo;
    panelOperacion?.querySelectorAll('[data-op]').forEach((b) => b.classList.toggle('is-active', b === op));
    if (tipo === 'programa') pintarProgramaEditor();
    if (tipo === 'asistentes') pintarAsistentesEditor();
    return;
  }
  const action = target.closest('[data-editor-action]');
  if (!(action instanceof HTMLButtonElement)) return;
  const tipo = action.dataset.editorAction;
  if (tipo === 'cancelar') { pecharEditor(); return; }
  if (tipo === 'engadir-programa') {
    const select = editorPanel()?.querySelector('#op-add-work');
    const id = select instanceof HTMLSelectElement ? select.value : '';
    if (!id) return;
    operacionActual.programa = [...(operacionActual.programa || []), { idRepertorio:id, orde:(operacionActual.programa?.length || 0) + 1, notas:'', solista:'' }];
    pintarProgramaEditor();
    return;
  }
  if (['subir','baixar','retirar'].includes(tipo || '')) {
    const li = action.closest('[data-program-id]');
    const id = li?.getAttribute('data-program-id');
    if (!id) return;
    const atual = lerProgramaEditor();
    const i = atual.findIndex((x) => x.idRepertorio === id);
    if (tipo === 'retirar') atual.splice(i,1);
    if (tipo === 'subir' && i > 0) [atual[i-1],atual[i]]=[atual[i],atual[i-1]];
    if (tipo === 'baixar' && i >= 0 && i < atual.length-1) [atual[i+1],atual[i]]=[atual[i],atual[i+1]];
    operacionActual.programa = atual.map((x,idx)=>({...x,orde:idx+1}));
    pintarProgramaEditor();
    return;
  }
  if (tipo === 'gardar-programa') {
    const programa = lerProgramaEditor();
    action.disabled = true;
    estadoPanel('Gardando programa…');
    try {
      const out = await chamarOperacion('gardarPrograma', { programa });
      operacionActual = out.payload || { ...operacionActual, programa:programa.map((x,i)=>({...x,orde:i+1})) };
      actualizarProgramaDialogo();
      pintarProgramaEditor();
      estadoPanel('Programa gardado correctamente.', 'ok');
    } catch (e) { estadoPanel(e.message || String(e), 'erro'); }
    finally { action.disabled = false; }
    return;
  }
  if (tipo === 'gardar-asistentes') {
    const editor = editorPanel();
    const idsPersoas = editor instanceof HTMLElement ? [...editor.querySelectorAll('[data-person-id]:checked')].map((cb) => cb.getAttribute('data-person-id')).filter(Boolean) : [];
    action.disabled = true;
    estadoPanel('Gardando asistentes…');
    try {
      const out = await chamarOperacion('gardarAsistencias', { idsPersoas });
      operacionActual = out.payload || { ...operacionActual, asistentes:idsPersoas };
      actualizarAsistentesDialogo();
      pintarAsistentesEditor();
      estadoPanel('Asistentes gardados correctamente.', 'ok');
    } catch (e) { estadoPanel(e.message || String(e), 'erro'); }
    finally { action.disabled = false; }
  }
}

async function activarOperacion(id) {
  concertoActualId = String(id || '').trim();
  operacionActual = null;
  pecharEditor();
  const panel = prepararPanelOperacion();
  if (!(panel instanceof HTMLElement) || !concertoActualId) return;
  panel.hidden = true;
  estadoPanel('');
  try {
    operacionActual = await chamarOperacion('listar');
    panel.hidden = false;
  } catch (e) {
    if (e?.status !== 403) console.warn('Non se puido activar a xestión do concerto:', e);
    panel.hidden = true;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest('.concert-square[data-id]');
  if (card) window.setTimeout(() => activarOperacion(card.getAttribute('data-id')), 80);
}, true);

prepararPanelOperacion();
