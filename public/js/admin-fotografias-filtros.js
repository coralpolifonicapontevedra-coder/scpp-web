(() => {
  if (window.__scppAdminFotosFiltros) return;
  window.__scppAdminFotosFiltros = true;

  const filtros = [
    ['todas', 'Todas'],
    ['pendente', 'Pendentes'],
    ['publica', 'Públicas'],
    ['privada', 'Privadas'],
    ['nonpublicada', 'Non publicadas'],
    ['rexeitada', 'Rexeitadas']
  ];

  function instalar() {
    const app = document.querySelector('#app');
    const toolbar = app?.querySelector('.photos-toolbar');
    const select = app?.querySelector('#filter');
    const search = app?.querySelector('#search');
    if (!(toolbar instanceof HTMLElement) || !(select instanceof HTMLSelectElement)) return false;
    if (app.querySelector('.scpp-photo-quickfilters')) return true;

    const bar = document.createElement('div');
    bar.className = 'scpp-photo-quickfilters';
    bar.setAttribute('aria-label', 'Filtros rápidos de fotografías');

    const label = document.createElement('span');
    label.className = 'scpp-photo-quickfilters__label';
    label.textContent = 'Filtros rápidos';
    bar.append(label);

    for (const [value, text] of filtros) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scpp-photo-filter-button';
      button.dataset.filterValue = value;
      button.textContent = text;
      button.addEventListener('click', () => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        actualizarActivo();
      });
      bar.append(button);
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'scpp-photo-filter-button scpp-photo-filter-reset';
    reset.textContent = 'Limpar filtros';
    reset.addEventListener('click', () => {
      select.value = 'todas';
      if (search instanceof HTMLInputElement) search.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      if (search instanceof HTMLInputElement) search.dispatchEvent(new Event('input', { bubbles: true }));
      actualizarActivo();
    });
    bar.append(reset);

    toolbar.insertAdjacentElement('afterend', bar);

    function actualizarActivo() {
      bar.querySelectorAll('[data-filter-value]').forEach((node) => {
        if (!(node instanceof HTMLButtonElement)) return;
        node.setAttribute('aria-pressed', String(node.dataset.filterValue === select.value));
      });
    }

    select.addEventListener('change', actualizarActivo);
    actualizarActivo();
    return true;
  }

  if (instalar()) return;
  const observer = new MutationObserver(() => {
    if (instalar()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15000);
})();
