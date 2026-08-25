(() => {
  if (window.__scppAdminFotosEditorReset) return;
  window.__scppAdminFotosEditorReset = true;

  function resetEditorAfterDialogClose() {
    const shell = document.querySelector('#admin-photo-editor');
    const trigger = document.querySelector('#open-editor');

    if (!(shell instanceof HTMLElement) || shell.hidden) return;
    if (!(trigger instanceof HTMLAnchorElement)) return;

    // O editor integrado usa o mesmo botón como interruptor.
    // Ao pechar unha ficha sen editar, facemos ese peche interno
    // para que a seguinte fotografía non reutilice o canvas anterior.
    trigger.click();
  }

  function install() {
    const dialog = document.querySelector('#photo-dialog');
    if (!(dialog instanceof HTMLDialogElement)) return;

    dialog.addEventListener('close', () => {
      window.setTimeout(resetEditorAfterDialogClose, 0);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
