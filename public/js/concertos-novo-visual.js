const URL_CONCERTOS_VISUAL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSX8BEJ-hrubqEtaZ1zZaLSy7LoxaDQOuQuqR2ior7TZErtBGL5bJG0B_AK5Dp8eFeTDb3Pmpqh7Hnu/pub?gid=1098509641&single=true&output=csv';

const normalizarVisual = (valor = '') => String(valor)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

function parseCSVVisual(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    const seguinte = texto[i + 1];

    if (c === '"' && entreComillas && seguinte === '"') {
      campo += '"';
      i += 1;
    } else if (c === '"') {
      entreComillas = !entreComillas;
    } else if (c === ',' && !entreComillas) {
      fila.push(campo);
      campo = '';
    } else if ((c === '\n' || c === '\r') && !entreComillas) {
      if (c === '\r' && seguinte === '\n') i += 1;
      fila.push(campo);
      if (fila.some((valor) => String(valor).trim())) filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }

  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  const cabeceiras = (filas.shift() || []).map(normalizarVisual);
  return filas.map((valores) => Object.fromEntries(
    cabeceiras.map((cab, indice) => [cab, String(valores[indice] || '').trim()])
  ));
}

const valorVisual = (fila, ...nomes) => {
  for (const nome of nomes) {
    const valor = fila[normalizarVisual(nome)];
    if (valor !== undefined && valor !== '') return valor;
  }
  return '';
};

function cartelPublico(ruta = '') {
  const nome = String(ruta).replaceAll('\\', '/').split('/').filter(Boolean).pop();
  if (!nome) return '';
  return `/media/concertos/${encodeURIComponent(nome.replace(/\.pdf$/i, '.jpg'))}`;
}

function prepararDialogo() {
  const dialogo = document.querySelector('#dialogo');
  if (!(dialogo instanceof HTMLDialogElement) || dialogo.dataset.visualPreparado === 'true') return;

  const detailGrid = dialogo.querySelector('.detail-grid');
  const programSection = dialogo.querySelector('.program-section');
  const attendees = dialogo.querySelector('.attendees-section');
  if (!(detailGrid instanceof HTMLElement) || !(programSection instanceof HTMLElement) || !(attendees instanceof HTMLElement)) return;

  const shell = document.createElement('div');
  shell.className = 'concert-dialog-shell';

  const copy = document.createElement('div');
  copy.className = 'concert-dialog-copy';
  while (detailGrid.firstChild) copy.append(detailGrid.firstChild);

  const media = document.createElement('figure');
  media.className = 'concert-dialog-media';
  media.hidden = true;
  const img = document.createElement('img');
  img.id = 'cartel-concerto-novo';
  img.alt = '';
  media.append(img);

  shell.append(copy, media);
  detailGrid.replaceWith(shell);

  const body = document.createElement('div');
  body.className = 'concert-dialog-body';
  programSection.before(body);
  body.append(programSection, attendees);

  const description = document.createElement('p');
  description.id = 'descricion-concerto-novo';
  description.className = 'detail-description';
  copy.append(description);

  dialogo.dataset.visualPreparado = 'true';
}

let concertosVisual = new Map();

function aplicarMiniaturas() {
  document.querySelectorAll('.concert-square[data-id]').forEach((tarxeta) => {
    if (!(tarxeta instanceof HTMLButtonElement)) return;

    const id = String(tarxeta.dataset.id || '');
    const datos = concertosVisual.get(id) || {};
    const url = cartelPublico(datos.cartel || '');

    let corpo = tarxeta.querySelector('.concert-card-body');
    if (!(corpo instanceof HTMLElement)) {
      corpo = document.createElement('span');
      corpo.className = 'concert-card-body';
      const nodos = [...tarxeta.childNodes];
      nodos.forEach((nodo) => corpo.append(nodo));
      tarxeta.append(corpo);
    }

    let miniatura = tarxeta.querySelector('.concert-thumb');
    if (!(miniatura instanceof HTMLImageElement)) {
      miniatura = document.createElement('img');
      miniatura.className = 'concert-thumb';
      miniatura.loading = 'lazy';
      miniatura.decoding = 'async';
      tarxeta.insertBefore(miniatura, corpo);
    }

    miniatura.hidden = !url;
    if (!url) {
      miniatura.removeAttribute('src');
      miniatura.alt = '';
      return;
    }

    miniatura.src = url;
    miniatura.alt = `Cartel de ${tarxeta.querySelector('.square-copy strong')?.textContent || 'concerto'}`;
    miniatura.onerror = () => {
      miniatura.hidden = true;
    };
  });
}

async function cargarDatosVisuales() {
  try {
    const resposta = await fetch(`${URL_CONCERTOS_VISUAL}&v=${Date.now()}`, { cache: 'no-store' });
    if (!resposta.ok) return;
    const filas = parseCSVVisual(await resposta.text());
    concertosVisual = new Map(filas.map((fila) => [
      valorVisual(fila, 'Id', 'Row ID'),
      {
        cartel: valorVisual(fila, 'Cartel'),
        descricion: valorVisual(fila, 'Características', 'Caracteristicas'),
        hora: valorVisual(fila, 'Hora')
      }
    ]));
    aplicarMiniaturas();
  } catch (erro) {
    console.warn('Non foi posible cargar os datos visuais dos concertos.', erro);
  }
}

function actualizarDialogo(id) {
  prepararDialogo();
  const datos = concertosVisual.get(String(id || '')) || {};
  const dialogo = document.querySelector('#dialogo');
  if (!(dialogo instanceof HTMLDialogElement)) return;

  const media = dialogo.querySelector('.concert-dialog-media');
  const img = dialogo.querySelector('#cartel-concerto-novo');
  const descricion = dialogo.querySelector('#descricion-concerto-novo');
  const detalle = dialogo.querySelector('#detalle');
  const titulo = dialogo.querySelector('#titulo');
  const url = cartelPublico(datos.cartel || '');

  if (descricion instanceof HTMLElement) {
    descricion.textContent = datos.descricion || '';
    descricion.hidden = !datos.descricion;
  }

  if (detalle instanceof HTMLElement && datos.hora) {
    const texto = detalle.textContent || '';
    if (!texto.includes(datos.hora)) detalle.textContent = `${datos.hora} h · ${texto}`;
  }

  if (media instanceof HTMLElement && img instanceof HTMLImageElement) {
    media.hidden = !url;
    img.src = url;
    img.alt = url ? `Cartel de ${titulo?.textContent || 'concerto'}` : '';
    img.onerror = () => {
      media.hidden = true;
    };
  }
}

function enlazarEventos() {
  document.addEventListener('click', (evento) => {
    const target = evento.target;
    if (!(target instanceof Element)) return;
    const boton = target.closest('[data-id], [data-report-id]');
    if (!boton) return;
    const id = boton.getAttribute('data-id') || boton.getAttribute('data-report-id') || '';
    window.setTimeout(() => actualizarDialogo(id), 0);
  }, true);
}

function observarTarxetas() {
  const grid = document.querySelector('#grid');
  if (!(grid instanceof HTMLElement)) return;
  const observer = new MutationObserver(() => aplicarMiniaturas());
  observer.observe(grid, { childList: true });
}

prepararDialogo();
enlazarEventos();
observarTarxetas();
cargarDatosVisuales();
