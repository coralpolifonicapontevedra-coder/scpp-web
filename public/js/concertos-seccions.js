const SELECTOR_TARXETA = '.concert-square[data-id]';

function crearCabeceira(titulo, subtitulo = '') {
  const cabeceira = document.createElement('header');
  cabeceira.className = 'concert-section-heading';
  cabeceira.innerHTML = `<div><span>${subtitulo || 'Programación'}</span><h2>${titulo}</h2></div>`;
  return cabeceira;
}

function aplicarSeccions() {
  const grid = document.querySelector('#grid');
  if (!(grid instanceof HTMLElement)) return;

  const tarxetas = [...grid.querySelectorAll(`:scope > ${SELECTOR_TARXETA}`)];
  const sinatura = tarxetas.map((tarxeta) => `${tarxeta.getAttribute('data-id')}:${tarxeta.classList.contains('is-past') ? 'p' : 'f'}`).join('|');
  const proximas = tarxetas.filter((tarxeta) => !tarxeta.classList.contains('is-past'));
  const finalizadas = tarxetas.filter((tarxeta) => tarxeta.classList.contains('is-past'));
  const cabeceirasEsperadas = Number(proximas.length > 0) + Number(finalizadas.length > 0);
  const cabeceirasActuais = grid.querySelectorAll(':scope > .concert-section-heading').length;

  if (grid.dataset.sectionSignature === sinatura && cabeceirasActuais === cabeceirasEsperadas) return;

  grid.querySelectorAll(':scope > .concert-section-heading').forEach((nodo) => nodo.remove());

  if (proximas[0]) {
    grid.insertBefore(crearCabeceira('Próximos concertos', 'Vindeiras actuacións'), proximas[0]);
  }
  if (finalizadas[0]) {
    grid.insertBefore(crearCabeceira('Concertos finalizados', 'Desde abril de 2026'), finalizadas[0]);
  }

  grid.dataset.sectionSignature = sinatura;
}

function iniciarSeccions() {
  const grid = document.querySelector('#grid');
  if (!(grid instanceof HTMLElement)) return;
  aplicarSeccions();
  new MutationObserver(aplicarSeccions).observe(grid, { childList: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarSeccions, { once: true });
} else {
  iniciarSeccions();
}
