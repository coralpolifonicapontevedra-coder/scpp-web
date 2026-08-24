(() => {
  'use strict';

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest('#dialogo a.program-work');
    if (!(link instanceof HTMLAnchorElement)) return;

    const href = String(link.getAttribute('href') || '').trim();
    if (!href) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    window.location.assign(new URL(href, window.location.href).toString());
  }, true);
})();
