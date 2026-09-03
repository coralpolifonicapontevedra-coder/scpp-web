(() => {
  const ADMIN_PATH = '/portal/administracion/persoas';
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== ADMIN_PATH) return;

  const originalFetch = window.fetch.bind(window);
  let panel = null;
  let creating = false;
  let lastIdToken = '';
  let generatedLink = '';
  let generatedEmail = '';
  let generatedReviewToken = '';

  // Gardamos o token administrativo das peticións normais da páxina.
  window.fetch = async function invitationSessionFetch(input, init) {
    try {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      if (url.includes('/api/persoas-v2') && init?.body) {
        const body = JSON.parse(String(init.body));
        const token = String(body?.idToken || '').trim();
        if (token) lastIdToken = token;
      }
    } catch {
      // Nunca interromper as peticións normais da páxina.
    }
    return originalFetch(input, init);
  };

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

  function resetGenerated() {
    generatedLink = '';
    generatedEmail = '';
    generatedReviewToken = '';
    const box = panel?.querySelector('[data-invite-result]');
    const send = panel?.querySelector('[data-invite-send]');
    if (box instanceof HTMLElement) box.hidden = true;
    if (send instanceof HTMLButtonElement) send.hidden = true;
  }

  function showGeneratedLink(link) {
    generatedLink = link;
    try {
      generatedReviewToken = new URL(link, window.location.origin).searchParams.get('token') || '';
    } catch {
      generatedReviewToken = '';
    }
    const box = panel?.querySelector('[data-invite-result]');
    const input = panel?.querySelector('#invite-link-v2');
    const send = panel?.querySelector('[data-invite-send]');
    if (box instanceof HTMLElement) box.hidden = false;
    if (input instanceof HTMLInputElement) input.value = link;
    if (send instanceof HTMLButtonElement) send.hidden = false;
  }

  async function generateReview(idPersoa) {
    const response = await originalFetch('/api/persoas-revision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'xerarLigazon', idToken: lastIdToken, idPersoa })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true || !result?.ligazon) {
      throw new Error(result?.erro || 'A alta quedou creada, pero non se puido xerar a ligazón.');
    }
    return String(result.ligazon);
  }

  async function uploadProfilePhoto(file) {
    if (!file) return;
    if (!generatedReviewToken) throw new Error('Non se puido asociar a fotografía á invitación.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('A fotografía debe ser JPG, PNG ou WebP.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('A fotografía non pode superar 5 MB.');
    }
    const form = new FormData();
    form.append('token', generatedReviewToken);
    form.append('foto', file, file.name);
    const response = await originalFetch('/api/persoas-foto', { method: 'POST', body: form });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.erro || 'A invitación foi creada, pero non se puido gardar a fotografía.');
    }
  }

  async function sendGeneratedLink() {
    if (!generatedLink || !lastIdToken) {
      state('Primeiro tes que xerar a ligazón.', true);
      return;
    }
    setBusy(true);
    state('Enviando correo…');
    try {
      const response = await originalFetch('/api/persoas-revision-envio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: lastIdToken, ligazons: [generatedLink] })
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

  function createPanel() {
    if (document.querySelector('#scpp-invite-panel-v2')) return;
    const section = document.createElement('section');
    section.id = 'scpp-invite-panel-v2';
    section.hidden = true;
    section.innerHTML = `
      <div class="scpp-invite-card-v2">
        <header>
          <span>Administración · Persoas</span>
          <h2>Alta por invitación</h2>
          <p>Introduce os datos mínimos. Crearase a ficha e unha ligazón segura para que a persoa complete os seus datos.</p>
        </header>
        <form autocomplete="off">
          <label><span>Nome *</span><input id="invite-name-v2" required /></label>
          <label><span>Correo electrónico *</span><input id="invite-email-v2" type="email" required /></label>
          <label><span>Teléfono *</span><input id="invite-phone-v2" type="tel" required /></label>
          <label class="invite-photo-field-v2">
            <span>Fotografía de perfil (opcional)</span>
            <input id="invite-photo-v2" type="file" accept="image/jpeg,image/png,image/webp" />
            <small>JPG, PNG ou WebP · máximo 5 MB. Gardarase como fotografía privada do perfil. Non autoriza a súa publicación.</small>
          </label>
          <div data-invite-result hidden>
            <label><span>Ligazón xerada</span><input id="invite-link-v2" readonly /></label>
            <button type="button" class="secondary-action" data-invite-copy>Copiar ligazón</button>
          </div>
          <p class="scpp-invite-state-v2" data-invite-state role="status"></p>
          <footer>
            <button type="button" class="secondary-action" data-invite-close>Pechar</button>
            <button type="button" class="secondary-action" data-invite-send hidden>Enviar por correo</button>
            <button type="submit" class="primary-action">Crear invitación</button>
          </footer>
        </form>
      </div>`;
    document.body.append(section);
    panel = section;

    const style = document.createElement('style');
    style.textContent = `#scpp-invite-panel-v2[hidden]{display:none!important}#scpp-invite-panel-v2{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:1rem;background:rgba(31,25,24,.52)}.scpp-invite-card-v2{width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;border:1px solid #d8d1cb;padding:1.35rem;box-shadow:0 18px 55px rgba(0,0,0,.22)}.scpp-invite-card-v2 form{display:grid;gap:.85rem}.scpp-invite-card-v2 label{display:grid;gap:.35rem}.scpp-invite-card-v2 input{width:100%;min-height:2.8rem;padding:.6rem .75rem;border:1px solid #cfc8c2}.scpp-invite-card-v2 input[type=file]{padding:.55rem}.invite-photo-field-v2 small{color:#6d6763;line-height:1.4}.scpp-invite-card-v2 footer{display:flex;justify-content:flex-end;gap:.65rem;flex-wrap:wrap}.scpp-invite-state-v2[data-error="true"]{color:#8b2530}`;
    document.head.append(style);

    section.querySelector('[data-invite-close]')?.addEventListener('click', () => {
      if (!creating) section.hidden = true;
    });
    section.querySelector('[data-invite-send]')?.addEventListener('click', sendGeneratedLink);
    section.querySelector('[data-invite-copy]')?.addEventListener('click', async () => {
      if (!generatedLink) return;
      try {
        await navigator.clipboard.writeText(generatedLink);
        state('Ligazón copiada.');
      } catch {
        state('Non foi posible copiar automaticamente. Selecciona a ligazón e cópiaa.', true);
      }
    });
    section.querySelector('form')?.addEventListener('submit', submitInvitation);
  }

  async function submitInvitation(event) {
    event.preventDefault();
    if (creating || !(panel instanceof HTMLElement)) return;

    const nome = String(panel.querySelector('#invite-name-v2')?.value || '').trim();
    const correo = String(panel.querySelector('#invite-email-v2')?.value || '').trim();
    const telefono = String(panel.querySelector('#invite-phone-v2')?.value || '').trim();
    const photoInput = panel.querySelector('#invite-photo-v2');
    const photo = photoInput instanceof HTMLInputElement ? photoInput.files?.[0] : null;

    if (!nome || !correo || !telefono) {
      state('Nome, correo e teléfono son obrigatorios.', true);
      return;
    }
    if (!lastIdToken) {
      state('Non se puido recuperar a sesión administrativa. Recarga a páxina e inténtao de novo.', true);
      return;
    }
    if (photo && photo.size > 5 * 1024 * 1024) {
      state('A fotografía non pode superar 5 MB.', true);
      return;
    }

    resetGenerated();
    generatedEmail = correo;
    creating = true;
    setBusy(true);
    state('Creando ficha…');

    try {
      const createResponse = await originalFetch('/api/persoas-alta-invitacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: lastIdToken, nome, correo, telefono })
      });
      const created = await createResponse.json().catch(() => null);
      if (!createResponse.ok || created?.ok !== true || !created?.idPersoa) {
        throw new Error(created?.erro || 'Non foi posible crear a alta por invitación.');
      }

      state('Ficha creada. Xerando ligazón segura…');
      const link = await generateReview(String(created.idPersoa));
      showGeneratedLink(link);

      if (photo) {
        state('Ligazón creada. Gardando fotografía de perfil…');
        await uploadProfilePhoto(photo);
      }

      state(photo
        ? 'Invitación e fotografía gardadas. Revisa a ligazón antes de enviar o correo.'
        : 'Invitación creada. Revisa a ligazón antes de enviar o correo.');
    } catch (error) {
      state(error instanceof Error ? error.message : 'Non foi posible preparar a invitación.', true);
    } finally {
      creating = false;
      setBusy(false);
    }
  }

  function install() {
    createPanel();
    if (document.querySelector('#invite-person-button-v2')) return true;
    const manual = document.querySelector('#new-person-button');
    if (!(manual instanceof HTMLButtonElement)) return false;

    const button = document.createElement('button');
    button.id = 'invite-person-button-v2';
    button.type = 'button';
    button.className = 'secondary-action';
    button.textContent = '+ Alta por invitación';
    manual.before(button);
    button.addEventListener('click', () => {
      resetGenerated();
      state('');
      if (panel instanceof HTMLElement) panel.hidden = false;
      const name = panel?.querySelector('#invite-name-v2');
      if (name instanceof HTMLInputElement) name.focus();
    });
    return true;
  }

  // Sen observadores globais: intentos limitados e detéñense ao instalar o botón.
  let attempts = 0;
  const tryInstall = () => {
    attempts += 1;
    if (install() || attempts >= 80) window.clearInterval(timer);
  };
  const timer = window.setInterval(tryInstall, 100);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
  } else {
    tryInstall();
  }
})();
