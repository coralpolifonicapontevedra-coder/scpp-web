import { portalRequest } from './portal-session.js';

const ROUTE = '/portal/administracion/repertorio/';
const clean = (value) => String(value ?? '').trim();

function eRutaRepertorio() {
  const path = `${window.location.pathname.replace(/\/+$/, '')}/`;
  return path === ROUTE;
}

function tabActiva() {
  return document.querySelector('[data-tab].active')?.getAttribute('data-tab') || 'obras';
}

function tipoActual() {
  const tab = tabActiva();
  return tab === 'partituras' ? 'partitura' : tab === 'audios' ? 'audio' : 'obra';
}

function etiquetaTipo(tipo) {
  return tipo === 'partitura' ? 'partitura' : tipo === 'audio' ? 'audio' : 'obra';
}

function idSeleccionado() {
  return clean(document.querySelector('#record-select')?.value);
}

function tituloSeleccionado() {
  return clean(document.querySelector('#detail-title')?.textContent) || 'este rexistro';
}

function detalleVisible() {
  const detail = document.querySelector('#detail');
  return detail && !detail.hidden && Boolean(idSeleccionado());
}

function asegurarEstilo() {
  if (document.querySelector('#scpp-repertorio-delete-style')) return;
  const style = document.createElement('style');
  style.id = 'scpp-repertorio-delete-style';
  style.textContent = `
    #detail-actions .scpp-delete-record{
      margin-left:auto;
      border:1px solid #9a3944;
      background:#fff;
      color:#8b2d36;
      padding:.7rem 1rem;
      font:inherit;
      font-weight:800;
      cursor:pointer;
    }
    #detail-actions .scpp-delete-record:hover{background:#fff5f5}
    #detail-actions .scpp-delete-record:disabled{cursor:wait;opacity:.6}
  `;
  document.head.append(style);
}

function asegurarBoton() {
  const footer = document.querySelector('#detail-actions');
  if (!footer) return;
  const existente = footer.querySelector('[data-scpp-delete-record]');
  if (!detalleVisible()) {
    existente?.remove();
    return;
  }
  const tipo = tipoActual();
  if (existente) {
    existente.dataset.tipo = tipo;
    existente.textContent = `Eliminar ${etiquetaTipo(tipo)}`;
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scpp-delete-record';
  button.dataset.scppDeleteRecord = '1';
  button.dataset.tipo = tipo;
  button.textContent = `Eliminar ${etiquetaTipo(tipo)}`;
  button.addEventListener('click', eliminarSeleccionado);
  footer.append(button);
}

async function eliminarSeleccionado(event) {
  const button = event.currentTarget;
  const tipo = tipoActual();
  const id = idSeleccionado();
  const titulo = tituloSeleccionado();
  if (!id) return;

  const avisoObra = tipo === 'obra'
    ? '\n\nA obra só se eliminará se non ten partituras nin audios vinculados.'
    : '\n\nTamén se eliminará o ficheiro de R2 asociado, se existe.';
  const confirmado = window.confirm(
    `Vas eliminar definitivamente a ${etiquetaTipo(tipo)} «${titulo}».\n\nEsta acción non se pode desfacer.${avisoObra}`
  );
  if (!confirmado) return;

  const textoAnterior = button.textContent;
  try {
    button.disabled = true;
    button.textContent = 'Eliminando…';
    const result = await portalRequest(
      '/api/repertorio-admin-eliminar',
      'eliminarRecursoRepertorioAdministracion',
      { tipo, id }
    );
    const aviso = result.r2Limpo === false
      ? '\n\nO rexistro foi eliminado, pero non se puido limpar o ficheiro de R2. Quedou anotado para revisión.'
      : '';
    window.alert(`✓ ${tipo === 'obra' ? 'Obra' : tipo === 'partitura' ? 'Partitura' : 'Audio'} eliminado correctamente.${aviso}`);
    window.location.reload();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
    button.disabled = false;
    button.textContent = textoAnterior;
  }
}

function iniciar() {
  if (!eRutaRepertorio()) return;
  asegurarEstilo();

  const detail = document.querySelector('#detail');
  const footer = document.querySelector('#detail-actions');
  if (detail) new MutationObserver(asegurarBoton).observe(detail, { attributes:true, childList:true, subtree:true });
  if (footer) new MutationObserver(asegurarBoton).observe(footer, { childList:true });

  document.querySelector('#record-select')?.addEventListener('change', () => queueMicrotask(asegurarBoton));
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => setTimeout(asegurarBoton, 0));
  });
  asegurarBoton();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once:true });
  else iniciar();
}
