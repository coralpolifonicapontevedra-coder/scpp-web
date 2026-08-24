(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/administracion/concertos')) return;
  if (window.__scppConcertosAdminInforme) return;
  window.__scppConcertosAdminInforme = true;

  let ultimoToken = '';
  const fetchOriginal = window.fetch.bind(window);

  async function xerarInforme(idToken, silencioso = false) {
    if (!idToken) return null;
    const response = await fetchOriginal('/api/concertos-admin-informe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, accion: 'xerar' })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      if (!silencioso) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
      return null;
    }
    return result;
  }

  window.fetch = async (input, init) => {
    let body = null;
    try {
      if (typeof init?.body === 'string') {
        body = JSON.parse(init.body);
        if (body?.idToken) ultimoToken = String(body.idToken);
      }
    } catch {}

    const response = await fetchOriginal(input, init);

    try {
      const valor = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(valor, window.location.href);
      if (url.pathname === '/api/concertos-admin' && body?.accion === 'finalizarXestion' && response.ok && ultimoToken) {
        xerarInforme(ultimoToken, true);
      }
    } catch {}

    return response;
  };

  function engadirBoton() {
    const toolbar = document.querySelector('.admin-concerts-main .toolbar');
    if (!(toolbar instanceof HTMLElement) || toolbar.querySelector('#refresh-attendance-report')) return;

    const button = document.createElement('button');
    button.id = 'refresh-attendance-report';
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = 'Actualizar informe de asistencia';

    const alta = toolbar.querySelector('#new-concert');
    if (alta) toolbar.insertBefore(button, alta);
    else toolbar.appendChild(button);

    button.addEventListener('click', async () => {
      if (!ultimoToken) {
        alert('A sesión aínda non está preparada. Recarga a páxina e téntao de novo.');
        return;
      }
      const texto = button.textContent;
      button.disabled = true;
      button.textContent = 'Xerando informe…';
      try {
        const result = await xerarInforme(ultimoToken);
        const resumo = result?.resumo || {};
        alert(`Informe actualizado: ${resumo.persoas || 0} persoas · ${resumo.asistencias || 0} asistencias · ${resumo.concertos || 0} concertos.`);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Non foi posible xerar o informe.');
      } finally {
        button.disabled = false;
        button.textContent = texto || 'Actualizar informe de asistencia';
      }
    });
  }

  const observer = new MutationObserver(engadirBoton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  engadirBoton();
})();
