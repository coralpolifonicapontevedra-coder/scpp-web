(() => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== '/portal/administracion/persoas') return;

  if (!document.querySelector('script[data-scpp-persoas-invitacion]')) {
    const invitationScript = document.createElement('script');
    invitationScript.src = '/js/persoas-alta-invitacion.js';
    invitationScript.defer = true;
    invitationScript.dataset.scppPersoasInvitacion = 'true';
    document.head.append(invitationScript);
  }

  const originalFetch = window.fetch.bind(window);
  let lastIdToken = '';
  let envioEnCurso = false;

  function reviewState() {
    return document.querySelector('#review-state');
  }

  function reviewLink() {
    return document.querySelector('#review-link');
  }

  function personName() {
    return String(document.querySelector('#person-name')?.textContent || 'a persoa seleccionada').trim();
  }

  function selectedEmail() {
    const sections = document.querySelectorAll('#person-sections .data-section');
    for (const section of sections) {
      const terms = section.querySelectorAll('dt');
      for (const term of terms) {
        if (String(term.textContent || '').trim() !== 'Correo electrónico') continue;
        return String(term.parentElement?.querySelector('dd')?.textContent || '').trim();
      }
    }
    return '';
  }

  function setReviewMessage(message) {
    const node = reviewState();
    if (node instanceof HTMLElement) node.textContent = message;
  }

  function syncFileButton() {
    const select = document.querySelector('#person-select');
    const button = document.querySelector('#open-file');
    if (!(button instanceof HTMLButtonElement)) return;
    const hasSelection = select instanceof HTMLSelectElement && Boolean(select.value);
    button.hidden = !hasSelection;
    button.title = hasSelection ? 'Comprobar e abrir a ficha dispoñible en R2' : '';
  }

  function ensureSendButton() {
    const footerActions = document.querySelector('#review-dialog .dialog-footer > div');
    if (!(footerActions instanceof HTMLElement)) return null;

    let button = document.querySelector('#send-review-email');
    if (button instanceof HTMLButtonElement) return button;

    button = document.createElement('button');
    button.id = 'send-review-email';
    button.type = 'button';
    button.className = 'primary-action';
    button.textContent = 'Enviar por correo';
    footerActions.prepend(button);
    button.addEventListener('click', sendReviewEmail);
    return button;
  }

  async function sendReviewEmail() {
    const button = ensureSendButton();
    const linkNode = reviewLink();
    const ligazon = linkNode instanceof HTMLInputElement ? linkNode.value.trim() : '';
    const correo = selectedEmail();

    if (!ligazon) { setReviewMessage('Primeiro tes que xerar a ligazón de revisión.'); return; }
    if (!lastIdToken) { setReviewMessage('Non foi posible recuperar a sesión. Pecha esta xanela e xera de novo a revisión.'); return; }
    if (!correo) { setReviewMessage('A persoa seleccionada non ten un correo electrónico válido na ficha.'); return; }

    const ok = window.confirm(`Vas enviar a revisión de datos a ${personName()}.\n\nCorreo: ${correo}\n\nQueres continuar?`);
    if (!ok) return;

    envioEnCurso = true;
    if (button instanceof HTMLButtonElement) { button.disabled = true; button.textContent = 'Enviando…'; }
    setReviewMessage('Enviando correo…');

    try {
      const response = await originalFetch('/api/persoas-revision-envio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: lastIdToken, ligazons: [ligazon] })
      });
      const result = await response.json().catch(() => null);
      const enviados = Number(result?.envio?.enviados || 0);
      if (!response.ok || result?.ok !== true || enviados < 1) {
        const motivo = String(result?.erro || result?.envio?.erro || result?.envio?.detalle?.[0]?.motivo || 'Non foi posible enviar o correo.').trim();
        throw new Error(motivo);
      }
      const destino = String(result?.envio?.detalle?.[0]?.correo || correo).trim();
      setReviewMessage(destino ? `Correo enviado correctamente a ${destino}.` : 'Correo enviado correctamente.');
    } catch (error) {
      setReviewMessage(error instanceof Error ? error.message : 'Non foi posible enviar o correo.');
    } finally {
      envioEnCurso = false;
      if (button instanceof HTMLButtonElement) { button.disabled = false; button.textContent = 'Enviar por correo'; }
    }
  }

  window.fetch = async function patchedFetch(input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : String(input?.url || ''); }
    catch { return originalFetch(input, init); }

    if (!url.includes('/api/persoas-revision') || url.includes('/api/persoas-revision-envio')) return originalFetch(input, init);

    let body = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }

    const response = await originalFetch(input, init);
    if (body?.accion === 'xerarLigazon' && response.ok) {
      lastIdToken = String(body?.idToken || '').trim();
      ensureSendButton();
      setReviewMessage('Ligazón xerada. Podes enviala por correo ou copiala manualmente.');
    }
    return response;
  };

  document.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.id === 'person-select') queueMicrotask(syncFileButton);
  });

  const observer = new MutationObserver(() => syncFileButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  ensureSendButton();
  syncFileButton();
  document.addEventListener('DOMContentLoaded', () => { ensureSendButton(); syncFileButton(); }, { once: true });
})();
