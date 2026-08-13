(() => {
  let lastIdToken = '';
  const nativeFetch = window.fetch.bind(window);

  // O módulo Ensaios xa autentica todas as chamadas con Firebase. Gardamos o
  // token da súa propia chamada para reutilizar exactamente a mesma sesión
  // na acción de eliminación, sen crear un segundo fluxo de autenticación.
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/api/ensaios') && init?.body) {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        if (body?.idToken) lastIdToken = String(body.idToken);
      }
    } catch {}
    return nativeFetch(input, init);
  };

  function canEdit() {
    const button = document.querySelector('#new-rehearsal-button');
    return button instanceof HTMLButtonElement && !button.hidden;
  }

  function addDeleteButtons() {
    if (!canEdit()) return;
    const list = document.querySelector('#calendar-list');
    if (!(list instanceof HTMLElement)) return;

    list.querySelectorAll('.rehearsal-card[data-rehearsal]').forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const id = String(card.dataset.rehearsal || '').trim();
      if (!id || list.querySelector(`.delete-rehearsal[data-rehearsal="${CSS.escape(id)}"]`)) return;

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'delete-rehearsal';
      action.dataset.rehearsal = id;
      action.textContent = 'Eliminar';
      action.title = 'Eliminar este ensaio';
      card.insertAdjacentElement('afterend', action);
    });
  }

  async function deleteRehearsal(button) {
    const idEnsaio = String(button.dataset.rehearsal || '').trim();
    if (!idEnsaio) return;

    const card = document.querySelector(`.rehearsal-card[data-rehearsal="${CSS.escape(idEnsaio)}"]`);
    const description = (card?.textContent || 'este ensaio').replace(/\s+/g, ' ').trim();
    const accepted = window.confirm(`Eliminar definitivamente ${description}?\n\nTamén se eliminarán as asistencias e as obras asociadas a este ensaio.`);
    if (!accepted) return;

    if (!lastIdToken) {
      window.alert('A sesión aínda non está preparada. Actualiza a páxina e téntao de novo.');
      return;
    }

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Eliminando…';

    try {
      const response = await nativeFetch('/api/ensaios-eliminar-ensaio', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        cache:'no-store',
        body:JSON.stringify({ idToken:lastIdToken, idEnsaio })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.erro || `Erro ${response.status}`);
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      button.textContent = oldText;
      window.alert(error instanceof Error ? error.message : 'Non foi posible eliminar o ensaio.');
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('.delete-rehearsal');
    if (button instanceof HTMLButtonElement) deleteRehearsal(button);
  });

  const observer = new MutationObserver(addDeleteButtons);
  document.addEventListener('DOMContentLoaded', () => {
    addDeleteButtons();
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
  }, { once:true });
})();
