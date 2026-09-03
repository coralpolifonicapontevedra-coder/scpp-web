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
    if (existente) existente.remove();
    return;
  }

  const tipo = tipoActual();
  const texto = `Eliminar ${etiquetaTipo(tipo)}`;

  if (existente) {
    if (existente.dataset.tipo !== tipo) existente.dataset.tipo = tipo;
    if (existente.textContent !== texto) existente.textContent = texto;
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scpp-delete-record';
  button.dataset.scppDeleteRecord = '1';
  button.dataset.tipo = tipo;
  button.textContent = texto;
  button.addEventListener('click', eliminarSeleccionado);
  footer.append(button);
}

function programarBoton() {
  setTimeout(asegurarBoton, 0);
  setTimeout(asegurarBoton, 120);
}

async function pedirEliminacion(tipo, id, cascada = false) {
  return portalRequest(
    '/api/repertorio-admin-eliminar',
    'eliminarRecursoRepertorioAdministracion',
    { tipo, id, cascada }
  );
}

async function eliminarSeleccionado(event) {
  const button = event.currentTarget;
  const tipo = tipoActual();
  const id = idSeleccionado();
  const titulo = tituloSeleccionado();
  if (!id) return;

  const aviso = tipo === 'obra'
    ? '\n\nSe ten recursos vinculados, antes de borralos pedirase unha segunda confirmación.'
    : '\n\nTamén se eliminará o ficheiro de R2 asociado, se existe.';
  const confirmado = window.confirm(
    `Vas eliminar definitivamente a ${etiquetaTipo(tipo)} «${titulo}».\n\nEsta acción non se pode desfacer.${aviso}`
  );
  if (!confirmado) return;

  const textoAnterior = button.textContent;
  try {
    button.disabled = true;
    button.textContent = 'Comprobando…';

    let result = await pedirEliminacion(tipo, id, false);

    if (tipo === 'obra' && result.requireCascade === true) {
      const partituras = Number(result.dependencias?.partituras || 0);
      const audios = Number(result.dependencias?.audios || 0);
      const confirmarCascada = window.confirm(
        `A obra «${titulo}» ten ${partituras} partitura(s) e ${audios} audio(s) vinculados.\n\n` +
        'Se continúas eliminaranse tamén eses recursos e os seus ficheiros de R2.\n\n' +
        'Queres eliminar todo en cascada?'
      );
      if (!confirmarCascada) {
        button.disabled = false;
        button.textContent = textoAnterior;
        return;
      }
      button.textContent = 'Eliminando todo…';
      result = await pedirEliminacion(tipo, id, true);
    }

    const partes = [];
    if (result.eliminados) {
      partes.push(`${Number(result.eliminados.partituras || 0)} partitura(s)`);
      partes.push(`${Number(result.eliminados.audios || 0)} audio(s)`);
    }
    const resumoCascada = partes.length ? `\n\nEliminados tamén: ${partes.join(' e ')}.` : '';
    const avisoR2 = result.r2Limpo === false
      ? `\n\nA eliminación nas Sheets rematou, pero fallou a limpeza de ${result.r2Fallos?.length || 0} ficheiro(s) de R2. Quedaron identificados para revisión.`
      : '';

    window.alert(`✓ ${tipo === 'obra' ? 'Obra' : tipo === 'partitura' ? 'Partitura' : 'Audio'} eliminado correctamente.${resumoCascada}${avisoR2}`);
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
  if (detail) {
    new MutationObserver(programarBoton).observe(detail, {
      attributes: true,
      attributeFilter: ['hidden']
    });
  }

  document.querySelector('#record-select')?.addEventListener('change', programarBoton);
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', programarBoton);
  });

  programarBoton();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once:true });
  else iniciar();
}
