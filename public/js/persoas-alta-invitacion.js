(() => {
  const ADMIN_PATH = '/portal/administracion/persoas';
  const REVIEW_PATH = '/revision-datos';
  const SURNAME_SENTINEL = '__SCPP_PENDENTE_APELIDO__';
  const path = window.location.pathname.replace(/\/+$/, '');

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
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus({ preventScroll: true });
        }
        window.clearInterval(timer);
      } else if (attempts > 120) window.clearInterval(timer);
    }, 100);
  }

  if (path === REVIEW_PATH) {
    clearPendingSurnameOnPublicReview();
    return;
  }
  if (path !== ADMIN_PATH) return;

  const originalFetch = window.fetch.bind(window);
  let panel = null;
  let creating = false;
  let generatedLink = '';
  let generatedToken = '';
  let generatedEmail = '';

  function state(message, error = false) {
    const node = panel?.querySelector('[data-invite-state]');
    if (node instanceof HTMLElement) {
      node.textContent = message;
      node.dataset.error = error ? 'true' : 'false';
    }
  }

  function setBusy(busy) {
    panel?.querySelectorAll('button').forEach((button) => {
      if (button instanceof HTMLButtonElement) button.disabled = busy;
    });
  }

  function showGeneratedLink(link) {
    generatedLink = link;
    const box = panel?.querySelector('[data-invite-result]');
    const input = panel?.querySelector('#invite-link');
    const send = panel?.querySelector('[data-invite-send]');
    if (box instanceof HTMLElement) box.hidden = false;
    if (input instanceof HTMLInputElement) input.value = link;
    if (send instanceof HTMLButtonElement) send.hidden = false;
  }

  function resetGenerated() {
    generatedLink = '';
    generatedToken = '';
    generatedEmail = '';
    const box = panel?.querySelector('[data-invite-result]');
    const send = panel?.querySelector('[data-invite-send]');
    if (box instanceof HTMLElement) box.hidden = true;
    if (send instanceof HTMLButtonElement) send.hidden = true;
  }

  async function generateReview(idToken, idPersoa) {
    const response = await originalFetch('/api/persoas-revision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'xerarLigazon', idToken, idPersoa })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true || !result?.ligazon) {
      throw new Error(result?.erro || 'A ficha foi creada, pero non se puido xerar a ligazón.');
    }
    return String(result.ligazon);
  }

  async function sendGeneratedLink() {
    if (!generatedLink || !generatedToken) {
      state('Primeiro tes que xerar a ligazón.', true);
      return;
    }
    setBusy(true);
    state('Enviando correo…');
    try {
      const response = await originalFetch('/api/persoas-revision-envio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: generatedToken, ligazons: [generatedLink] })
      });
      const result = await response.json().catch(() => null);
      const enviados = Number(result?.envio?.enviados || 0);
      if (!response.ok || result?.ok !== true || enviados < 1) {
        throw new Error(result?.erro || result?.envio?.erro || result?.envio?.detalle?.[0]?.motivo || 'Non foi posible enviar o correo.');
      }
      state(`Correo enviado correctamente${generatedEmail ? ` a ${generatedEmail}` : ''}.`);
    } catch (error) {
      state(error instanceof Error ? error.message : 'Non foi posible enviar o correo.', true);
    } finally {
      setBusy(false);
    }
  }

  function restorePersonDialog() {
    const dialog = document.querySelector('#person-dialog');
    if (!(dialog instanceof HTMLDialogElement)) return;
    dialog.style.removeProperty('visibility');
    dialog.style.removeProperty('pointer-events');
    if (dialog.open) dialog.close();
  }

  window.fetch = async function invitationFetch(input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : String(input?.url || ''); }
    catch { return originalFetch(input, init); }

    let body = null;
    if (creating && url.includes('/api/persoas-v2') && init?.body) {
      try { body = JSON.parse(String(init.body)); } catch { body = null; }
    }

    const isInvitationCreate = creating &&
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
        if (!idToken) throw new Error('A ficha foi creada, pero non se puido recuperar a sesión.');
        state('Ficha provisional creada. Xerando ligazón…');
        const link = await generateReview(idToken, String(result.idPersoa));
        generatedToken = idToken;
        showGeneratedLink(link);
        state('Ligazón xerada correctamente. Revísaa e, se todo está ben, podes enviar o correo.');
      } catch (error) {
        state(error instanceof Error ? error.message : 'Non foi posible preparar a invitación.', true);
      } finally {
        creating = false;
        setBusy(false);
        restorePersonDialog();
      }
    })();
    return response;
  };

  function createPanel() {
    if (document.querySelector('#scpp-invite-panel')) return;
    const section = document.createElement('section');
    section.id = 'scpp-invite-panel';
    section.hidden = true;
    section.innerHTML = `
      <div class="scpp-invite-card">
        <header>
          <span>Administración · Persoas</span>
          <h2>Alta por invitación</h2>
          <p>Introduce os datos mínimos. Primeiro crearase a ficha provisional e a ligazón segura; o correo só se enviará cando o confirmes.</p>
        </header>
        <form autocomplete="off">
          <label><span>Nome *</span><input id="invite-name" required /></label>
          <label><span>Correo electrónico *</span><input id="invite-email" type="email" required /></label>
          <label><span>Teléfono *</span><input id="invite-phone" type="tel" required /></label>
          <p class="scpp-invite-note">A fotografía poderá engadila a propia persoa no formulario. A súa subida non autoriza a publicación.</p>
          <div data-invite-result hidden>
            <label><span>Ligazón xerada</span><input id="invite-link" readonly /></label>
            <button type="button" class="secondary-action" data-invite-copy>Copiar ligazón</button>
          </div>
          <p class="scpp-invite-state" data-invite-state role="status"></p>
          <footer>
            <button type="button" class="secondary-action" data-invite-close>Pechar</button>
            <button type="button" class="secondary-action" data-invite-send hidden>Enviar por correo</button>
            <button type="submit" class="primary-action" data-invite-submit>Crear invitación</button>
          </footer>
        </form>
      </div>`;
    document.body.append(section);
    panel = section;

    const style = document.createElement('style');
    style.textContent = `#scpp-invite-panel[hidden]{display:none!important}#scpp-invite-panel{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:1rem;background:rgba(31,25,24,.52)}.scpp-invite-card{width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;border:1px solid #d8d1cb;padding:1.35rem;box-shadow:0 18px 55px rgba(0,0,0,.22)}.scpp-invite-card form{display:grid;gap:.85rem}.scpp-invite-card label{display:grid;gap:.35rem}.scpp-invite-card input{width:100%;min-height:2.8rem;padding:.6rem .75rem;border:1px solid #cfc8c2}.scpp-invite-card footer{display:flex;justify-content:flex-end;gap:.65rem;flex-wrap:wrap}.scpp-invite-state[data-error="true"]{color:#8b2530}`;
    document.head.append(style);

    section.querySelector('[data-invite-close]')?.addEventListener('click', () => { if (!creating) section.hidden = true; });
    section.querySelector('[data-invite-send]')?.addEventListener('click', sendGeneratedLink);
    section.querySelector('[data-invite-copy]')?.addEventListener('click', async () => {
      if (!generatedLink) return;
      try { await navigator.clipboard.writeText(generatedLink); state('Ligazón copiada.'); }
      catch { state('Non foi posible copiar automaticamente. Selecciona a ligazón e cópiaa.', true); }
    });
    section.querySelector('form')?.addEventListener('submit', submitInvitation);
  }

  async function submitInvitation(event) {
    event.preventDefault();
    if (creating || !(panel instanceof HTMLElement)) return;
    const name = String(panel.querySelector('#invite-name')?.value || '').trim();
    const email = String(panel.querySelector('#invite-email')?.value || '').trim();
    const phone = String(panel.querySelector('#invite-phone')?.value || '').trim();
    if (!name || !email || !phone) {
      state('Nome, correo e teléfono son obrigatorios.', true);
      return;
    }
    resetGenerated();
    generatedEmail = email;
    const newButton = document.querySelector('#new-person-button');
    const personForm = document.querySelector('#person-form');
    const personDialog = document.querySelector('#person-dialog');
    if (!(newButton instanceof HTMLButtonElement) || !(personForm instanceof HTMLFormElement) || !(personDialog instanceof HTMLDialogElement)) {
      state('Non se puido abrir o formulario administrativo de alta.', true);
      return;
    }

    creating = true;
    setBusy(true);
    state('Creando ficha provisional…');
    newButton.click();
    const firstName = document.querySelector('#f-nome');
    const surname = document.querySelector('#f-primeiro');
    const emailInput = document.querySelector('#f-correo');
    const phoneInput = document.querySelector('#f-telefono');
    if (!(firstName instanceof HTMLInputElement) || !(surname instanceof HTMLInputElement) || !(emailInput instanceof HTMLInputElement) || !(phoneInput instanceof HTMLInputElement)) {
      creating = false;
      setBusy(false);
      restorePersonDialog();
      state('Non se atoparon os campos necesarios.', true);
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
    manual.before(button);
    button.addEventListener('click', () => {
      resetGenerated();
      state('');
      if (panel instanceof HTMLElement) panel.hidden = false;
      const name = panel?.querySelector('#invite-name');
      if (name instanceof HTMLInputElement) name.focus();
    });
  }

  const observer = new MutationObserver(injectButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectButton, { once: true });
  else injectButton();
})();
