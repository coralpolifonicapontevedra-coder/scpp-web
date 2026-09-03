(() => {
  const ADMIN_PATH = '/portal/administracion/persoas';
  const REVIEW_PATH = '/revision-datos';
  const SURNAME_SENTINEL = '__SCPP_PENDENTE_APELIDO__';
  const path = window.location.pathname.replace(/\/+$/, '');

  function setFeedback(message, kind = 'ok') {
    const node = document.querySelector('#feedback');
    if (!(node instanceof HTMLElement)) return;
    node.textContent = message;
    node.className = `feedback ${kind === 'error' ? 'is-error' : 'is-ok'}`;
    node.hidden = false;
  }

  function clearPendingSurnameOnPublicReview() {
    if (path !== REVIEW_PATH) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const form = document.querySelector('#review-form');
      const input = document.querySelector('#f-primeiro');
      if (form instanceof HTMLFormElement && input instanceof HTMLInputElement && !form.hidden) {
        if (input.value === SURNAME_SENTINEL) {
          input.value = '';
          input.placeholder = 'Completa o teu primeiro apelido';
          input.setAttribute('aria-description', 'Este dato debe completarse antes de confirmar a ficha.');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus({ preventScroll: true });
        }
        window.clearInterval(timer);
      } else if (attempts > 120) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  if (path === REVIEW_PATH) {
    clearPendingSurnameOnPublicReview();
    return;
  }
  if (path !== ADMIN_PATH) return;

  const originalFetch = window.fetch.bind(window);
  let invitationInProgress = false;
  let invitationPanel = null;

  function panelState(message, isError = false) {
    const state = invitationPanel?.querySelector('[data-invite-state]');
    if (!(state instanceof HTMLElement)) return;
    state.textContent = message;
    state.dataset.error = isError ? 'true' : 'false';
  }

  function setPanelBusy(busy) {
    const submit = invitationPanel?.querySelector('[data-invite-submit]');
    const close = invitationPanel?.querySelector('[data-invite-close]');
    if (submit instanceof HTMLButtonElement) submit.disabled = busy;
    if (close instanceof HTMLButtonElement) close.disabled = busy;
  }

  function restorePersonDialog() {
    const dialog = document.querySelector('#person-dialog');
    if (!(dialog instanceof HTMLDialogElement)) return;
    dialog.style.removeProperty('visibility');
    dialog.style.removeProperty('pointer-events');
    if (dialog.open) dialog.close();
  }

  function showPanel() {
    if (!(invitationPanel instanceof HTMLElement)) return;
    invitationPanel.hidden = false;
    const name = invitationPanel.querySelector('#invite-name');
    if (name instanceof HTMLInputElement) name.focus();
  }

  function hidePanel() {
    if (invitationInProgress || !(invitationPanel instanceof HTMLElement)) return;
    invitationPanel.hidden = true;
    panelState('');
  }

  async function completeInvitation(idToken, idPersoa) {
    const reviewResponse = await originalFetch('/api/persoas-revision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'xerarLigazon', idToken, idPersoa })
    });
    const review = await reviewResponse.json().catch(() => null);
    if (!reviewResponse.ok || review?.ok !== true || !review?.ligazon) {
      throw new Error(review?.erro || 'A persoa foi creada, pero non se puido xerar a ligazón de alta.');
    }

    const sendResponse = await originalFetch('/api/persoas-revision-envio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, ligazons: [review.ligazon] })
    });
    const sent = await sendResponse.json().catch(() => null);
    const enviados = Number(sent?.envio?.enviados || 0);
    if (!sendResponse.ok || sent?.ok !== true || enviados < 1) {
      const reason = String(
        sent?.erro || sent?.envio?.erro || sent?.envio?.detalle?.[0]?.motivo ||
        'A persoa foi creada e a ligazón xerada, pero non se puido enviar o correo.'
      ).trim();
      throw new Error(reason);
    }

    return {
      correo: String(sent?.envio?.detalle?.[0]?.correo || '').trim(),
      ligazon: String(review.ligazon)
    };
  }

  window.fetch = async function invitationFetch(input, init) {
    let url = '';
    try {
      url = typeof input === 'string' ? input : String(input?.url || '');
    } catch {
      return originalFetch(input, init);
    }

    let body = null;
    if (invitationInProgress && url.includes('/api/persoas-v2') && init?.body) {
      try { body = JSON.parse(String(init.body)); } catch { body = null; }
    }

    const isInvitationCreate = invitationInProgress &&
      body?.accion === 'crearPersoaAdministracion' &&
      body?.persoa?.primeiroApelido === SURNAME_SENTINEL;

    if (!isInvitationCreate) return originalFetch(input, init);

    const response = await originalFetch(input, init);
    const copy = response.clone();

    void (async () => {
      try {
        const result = await copy.json().catch(() => null);
        if (!response.ok || result?.ok !== true || !result?.idPersoa) {
          throw new Error(result?.erro || `Non foi posible crear a ficha provisional (HTTP ${response.status}).`);
        }
        const idToken = String(body?.idToken || '').trim();
        if (!idToken) throw new Error('A ficha provisional foi creada, pero non se puido recuperar a sesión para enviar a invitación.');

        panelState('Ficha provisional creada. Xerando e enviando a invitación…');
        const completed = await completeInvitation(idToken, String(result.idPersoa));
        const destination = completed.correo ? ` a ${completed.correo}` : '';
        panelState(`Alta por invitación preparada e correo enviado correctamente${destination}.`);
        setFeedback(`Alta por invitación creada e enviada${destination}.`);
        const form = invitationPanel?.querySelector('form');
        if (form instanceof HTMLFormElement) form.reset();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Non foi posible completar a alta por invitación.';
        panelState(message, true);
        setFeedback(message, 'error');
      } finally {
        invitationInProgress = false;
        setPanelBusy(false);
        restorePersonDialog();
      }
    })();

    return response;
  };

  function createPanel() {
    if (document.querySelector('#scpp-invite-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'scpp-invite-panel';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'scpp-invite-title');
    panel.innerHTML = `
      <div class="scpp-invite-card">
        <header>
          <span>Administración · Persoas</span>
          <h2 id="scpp-invite-title">Alta por invitación</h2>
          <p>Introduce só os datos necesarios para contactar coa persoa. Ela completará e confirmará o resto da ficha mediante unha ligazón segura.</p>
        </header>
        <form autocomplete="off">
          <label><span>Nome *</span><input id="invite-name" required /></label>
          <label><span>Correo electrónico *</span><input id="invite-email" type="email" required /></label>
          <label><span>Teléfono *</span><input id="invite-phone" type="tel" required /></label>
          <p class="scpp-invite-note">A fotografía poderá engadila a propia persoa no formulario. A súa subida non autoriza a publicación.</p>
          <p class="scpp-invite-state" data-invite-state role="status"></p>
          <footer>
            <button type="button" class="secondary-action" data-invite-close>Cancelar</button>
            <button type="submit" class="primary-action" data-invite-submit>Crear e enviar invitación</button>
          </footer>
        </form>
      </div>`;
    document.body.append(panel);
    invitationPanel = panel;

    const style = document.createElement('style');
    style.textContent = `
      #scpp-invite-panel[hidden]{display:none!important}#scpp-invite-panel{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:1rem;background:rgba(31,25,24,.52)}.scpp-invite-card{width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;border:1px solid #d8d1cb;padding:1.35rem;box-shadow:0 18px 55px rgba(0,0,0,.22)}.scpp-invite-card header{margin-bottom:1rem}.scpp-invite-card header>span,.scpp-invite-card label>span{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.scpp-invite-card h2{margin:.2rem 0 .45rem}.scpp-invite-card header p,.scpp-invite-note{color:#625c58;line-height:1.5}.scpp-invite-card form{display:grid;gap:.85rem}.scpp-invite-card label{display:grid;gap:.35rem}.scpp-invite-card input{width:100%;min-height:2.8rem;padding:.6rem .75rem;border:1px solid #cfc8c2;background:#fff;color:#2d2a28;font:inherit}.scpp-invite-card footer{display:flex;justify-content:flex-end;gap:.65rem;flex-wrap:wrap}.scpp-invite-state{min-height:1.35rem;margin:0;font-size:.92rem}.scpp-invite-state[data-error="true"]{color:#8b2530}`;
    document.head.append(style);

    panel.querySelector('[data-invite-close]')?.addEventListener('click', hidePanel);
    panel.querySelector('form')?.addEventListener('submit', submitInvitation);
  }

  async function submitInvitation(event) {
    event.preventDefault();
    if (invitationInProgress || !(invitationPanel instanceof HTMLElement)) return;

    const name = String(invitationPanel.querySelector('#invite-name')?.value || '').trim();
    const email = String(invitationPanel.querySelector('#invite-email')?.value || '').trim();
    const phone = String(invitationPanel.querySelector('#invite-phone')?.value || '').trim();
    if (!name || !email || !phone) {
      panelState('Nome, correo e teléfono son obrigatorios para enviar a invitación.', true);
      return;
    }

    const newButton = document.querySelector('#new-person-button');
    const personForm = document.querySelector('#person-form');
    const personDialog = document.querySelector('#person-dialog');
    if (!(newButton instanceof HTMLButtonElement) || !(personForm instanceof HTMLFormElement) || !(personDialog instanceof HTMLDialogElement)) {
      panelState('Non se puido abrir o formulario administrativo de alta.', true);
      return;
    }

    invitationInProgress = true;
    setPanelBusy(true);
    panelState('Creando ficha provisional…');

    newButton.click();
    const firstName = document.querySelector('#f-nome');
    const surname = document.querySelector('#f-primeiro');
    const emailInput = document.querySelector('#f-correo');
    const phoneInput = document.querySelector('#f-telefono');
    if (!(firstName instanceof HTMLInputElement) || !(surname instanceof HTMLInputElement) || !(emailInput instanceof HTMLInputElement) || !(phoneInput instanceof HTMLInputElement)) {
      invitationInProgress = false;
      setPanelBusy(false);
      restorePersonDialog();
      panelState('Non se atoparon os campos necesarios para crear a ficha provisional.', true);
      return;
    }

    firstName.value = name;
    surname.value = SURNAME_SENTINEL;
    emailInput.value = email;
    phoneInput.value = phone;
    personDialog.style.visibility = 'hidden';
    personDialog.style.pointerEvents = 'none';
    personForm.requestSubmit();
  }

  function injectButton() {
    createPanel();
    if (document.querySelector('#invite-person-button')) return;
    const manual = document.querySelector('#new-person-button');
    if (!(manual instanceof HTMLButtonElement)) return;
    const button = document.createElement('button');
    button.id = 'invite-person-button';
    button.type = 'button';
    button.className = 'secondary-action';
    button.textContent = '+ Alta por invitación';
    button.title = 'Crear unha ficha provisional con nome, correo e teléfono e enviar o formulario á persoa interesada';
    manual.before(button);
    button.addEventListener('click', showPanel);
  }

  const observer = new MutationObserver(injectButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectButton, { once: true });
  else injectButton();
})();
