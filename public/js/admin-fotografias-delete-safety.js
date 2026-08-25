(() => {
  const preparar = () => {
    const button = document.querySelector('#delete-photo');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.disabled = true;
    button.textContent = 'Eliminar (bloqueado en preview)';
    button.title = 'O borrado queda bloqueado ata verificar que os buckets R2 de Preview están completamente illados de produción.';
    return true;
  };

  if (!preparar()) {
    const observer = new MutationObserver(() => {
      if (preparar()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
