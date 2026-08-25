(() => {
  const idFoto = new URLSearchParams(window.location.search).get('idFoto');
  if (!idFoto) return;

  let done = false;
  const tryOpen = () => {
    if (done) return true;
    const buttons = document.querySelectorAll('[data-open]');
    const target = [...buttons].find((button) => String(button.dataset.open || '') === idFoto);
    if (!(target instanceof HTMLButtonElement)) return false;
    done = true;
    target.click();
    const url = new URL(window.location.href);
    url.searchParams.delete('idFoto');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
  };

  const start = () => {
    if (tryOpen()) return;
    const observer = new MutationObserver(() => {
      if (tryOpen()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15_000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
