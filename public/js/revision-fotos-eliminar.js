(() => {
  let lastIdToken = '';
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      if ((url.includes('/api/fotos') || url.includes('/api/editor-fotos')) && init?.body) {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        if (body?.idToken) lastIdToken = String(body.idToken);
      }
    } catch {}
    return nativeFetch(input, init);
  };

  function selectedPhotoId() {
    const select = document.querySelector('#photo-select');
    return select instanceof HTMLSelectElement ? String(select.value || '').trim() : '';
  }

  function selectedPhotoLabel() {
    const select = document.querySelector('#photo-select');
    if (!(select instanceof HTMLSelectElement)) return 'esta fotografía';
    return String(select.selectedOptions?.[0]?.textContent || 'esta fotografía').trim();
  }

  function setMessage(text, error = false) {
    const message = document.querySelector('#message');
    if (!(message instanceof HTMLElement)) return;
    message.textContent = text;
    message.dataset.error = error ? 'true' : 'false';
  }

  function prepararInterface() {
    const save = document.querySelector('#save-draft');
    if (save instanceof HTMLButtonElement) {
      save.textContent = 'Conservar sen publicar';
      save.title = 'Gardar a fotografía no arquivo sen publicala en ningunha galería';
    }

    const actions = document.querySelector('.review-column .actions');
    if (!(actions instanceof HTMLElement) || document.querySelector('#delete-photo-review')) return;

    const button = document.createElement('button');
    button.id = 'delete-photo-review';
    button.type = 'button';
    button.className = 'danger';
    button.textContent = 'Eliminar fotografía';
    button.title = 'Eliminar definitivamente esta fotografía do arquivo';
    actions.appendChild(button);
  }

  async function eliminarFotografia(button) {
    const idFoto = selectedPhotoId();
    if (!idFoto) {
      setMessage('Non hai ningunha fotografía seleccionada.', true);
      return;
    }

    const nome = selectedPhotoLabel();
    const accepted = window.confirm(
      `Eliminar definitivamente “${nome}”?\n\n` +
      'Eliminarase o rexistro da Sheet, o orixinal enviarase á papeleira de Drive e limparanse as copias de traballo de R2. Esta acción non debe usarse se só queres conservar a foto sen publicala.'
    );
    if (!accepted) return;

    if (!lastIdToken) {
      setMessage('A sesión aínda non está preparada. Actualiza a páxina e téntao de novo.', true);
      return;
    }

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Eliminando…';
    setMessage('Eliminando fotografía da Sheet, Drive e R2…');

    try {
      const response = await nativeFetch('/api/eliminar-foto-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ idToken: lastIdToken, idFoto })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.erro || `HTTP ${response.status}`);
      }

      setMessage(result.aviso || 'Fotografía eliminada correctamente. Actualizando a lista…', Boolean(result.aviso));
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      button.disabled = false;
      button.textContent = oldText;
      setMessage(error instanceof Error ? error.message : 'Non foi posible eliminar a fotografía.', true);
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('#delete-photo-review');
    if (button instanceof HTMLButtonElement) eliminarFotografia(button);
  });

  document.addEventListener('DOMContentLoaded', prepararInterface, { once: true });
  const observer = new MutationObserver(prepararInterface);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
