(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/administracion/concertos')) return;
  if (window.__scppConcertosAdminEliminar) return;
  window.__scppConcertosAdminEliminar = true;

  let idToken = '';
  const fetchAnterior = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body);
        if (body?.idToken) idToken = String(body.idToken);
      }
    } catch {}
    return fetchAnterior(input, init);
  };

  const style = document.createElement('style');
  style.textContent = '.delete-concert{border:1px solid #8b2d36!important;background:#fff!important;color:#8b2d36!important}.delete-concert:hover{background:#8b2d36!important;color:#fff!important}';
  document.head.appendChild(style);

  function engadirBotons() {
    document.querySelectorAll('.concert-card .actions').forEach((actions) => {
      if (!(actions instanceof HTMLElement) || actions.querySelector('.delete-concert')) return;
      const referencia = actions.querySelector('button[data-id]');
      if (!(referencia instanceof HTMLButtonElement)) return;
      const id = String(referencia.dataset.id || '').trim();
      if (!id || id.startsWith('hist-')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'delete-concert';
      button.dataset.id = id;
      button.textContent = 'Eliminar';
      actions.appendChild(button);
    });
  }

  const observer = new MutationObserver(engadirBotons);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  engadirBotons();

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.classList.contains('delete-concert')) return;

    const id = String(target.dataset.id || '').trim();
    if (!id || id.startsWith('hist-')) return;
    if (!idToken) {
      alert('A sesión aínda non está preparada para eliminar. Recarga a páxina e téntao de novo.');
      return;
    }

    const esperado = `ELIMINAR ${id}`;
    const confirmacion = window.prompt(
      `Esta acción eliminará definitivamente o concerto ${id}, o seu programa e as súas asistencias. Os ficheiros de respaldo consérvanse temporalmente por seguridade.\n\nEscribe exactamente: ${esperado}`
    );
    if (confirmacion !== esperado) return;

    target.disabled = true;
    const texto = target.textContent;
    target.textContent = 'Eliminando…';

    try {
      const response = await fetch('/api/concertos-admin-eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, idConcerto: id, confirmacion })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Non foi posible eliminar o concerto.');
      target.disabled = false;
      target.textContent = texto || 'Eliminar';
    }
  });
})();
