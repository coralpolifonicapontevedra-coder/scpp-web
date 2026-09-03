(() => {
  const ADMIN_PATH = '/portal/administracion/persoas';
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== ADMIN_PATH) return;

  const previousFetch = window.fetch.bind(window);
  let panel = null;
  let creating = false;
  let lastIdToken = '';
  let generatedLink = '';
  let generatedEmail = '';
  let statesLoading = false;
  let statesLoadedForToken = '';
  const altaStates = new Map();

  function selectedPersonId() {
    const select = document.querySelector('#person-select');
    return select instanceof HTMLSelectElement ? String(select.value || '').trim() : '';
  }

  function estadoAlta(id) {
    return altaStates.get(String(id || '').trim()) || '';
  }

  function renderAltaBadge() {
    const badges = document.querySelector('#person-card .badges');
    if (!(badges instanceof HTMLElement)) return;
    let badge = document.querySelector('#person-alta-status');
    const pending = estadoAlta(selectedPersonId()) === 'PENDENTE';
    if (!pending) {
      if (badge instanceof HTMLElement) badge.remove();
      return;
    }
    if (!(badge instanceof HTMLElement)) {
      badge = document.createElement('span');
      badge.id = 'person-alta-status';
      badge.className = 'scpp-alta-pending-badge';
      badges.append(badge);
    }
    badge.textContent = 'Pendente de completar ficha';
  }

  function renderPendingOptions() {
    const select = document.querySelector('#person-select');
    if (!(select instanceof HTMLSelectElement)) return;
    Array.from(select.options).forEach((option) => {
      if (!option.value) return;
      const original = option.dataset.scppOriginalLabel || option.textContent || '';
      option.dataset.scppOriginalLabel = original.replace(/ · PENDENTE DE COMPLETAR$/, '');
      option.textContent = estadoAlta(option.value) === 'PENDENTE'
        ? `${option.dataset.scppOriginalLabel} · PENDENTE DE COMPLETAR`
        : option.dataset.scppOriginalLabel;
    });
    renderAltaBadge();
  }

  async function loadAltaStates(force = false) {
    if (!lastIdToken || statesLoading) return;
    if (!force && statesLoadedForToken === lastIdToken) {
      renderPendingOptions();
      return;
    }
    statesLoading = true;
    try {
      const response = await previousFetch('/api/persoas-estados-alta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: lastIdToken })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true || !Array.isArray(result?.estados)) return;
      altaStates.clear();
      result.estados.forEach((item) => {
        const state = String(item?.estadoAlta || '').trim();
        const id = String(item?.idPersoa || '').trim();
        const rowId = String(item?.rowId || '').trim();
        if (id) altaStates.set(id, state);
        if (rowId) altaStates.set(rowId, state);
      });
      statesLoadedForToken = lastIdToken;
      renderPendingOptions();
    } catch {
      // O estado visual é auxiliar: non debe bloquear a xestión de Persoas.
    } finally {
      statesLoading = false;
    }
  }

  window.fetch = async function invitationSessionFetch(input, init) {
    try {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      if (url.includes('/api/persoas-v2') && init?.body) {
        const body = JSON.parse(String(init.body));
        const token = String(body?.idToken || '').trim();
        if (token && token !== lastIdToken) {
          lastIdToken = token;
          statesLoadedForToken = '';
          queueMicrotask(() => loadAltaStates());
        } else if (token) {
          lastIdToken = token;
        }
      }
    } catch {
      // Non interromper nunca as peticións normais da páxina.
    }
    const response = await previousFetch(input, init);
    return response;
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
    generatedEmail = '';
    const box = panel?.querySelector('[data-invite-result]');
    const send = panel?.querySelector('[data-invite-send]');
    if (box instanceof HTMLElement) box.hidden = true;
    if (send instanceof HTMLButtonElement) send.hidden = true;
  }

  async function generateReview(idPersoa) {
    const response = await previousFetch('/api/persoas-revision', {
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

  async function sendGeneratedLink() {
    if (!generatedLink || !lastIdToken) {
      state('Primeiro tes que xerar a ligazón.', true);
      return;
    }
    setBusy(true);
    state('Enviando correo…');
    try {
      const response = await previousFetch('/api/persoas-revision-envio', {
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
    if (document.querySelector('#scpp-invite-panel')) return;
    const section = document.createElement('section');
    section.id = 'scpp-invite-panel';
    section.hidden = true;
    section.innerHTML = `
      <div class="scpp-invite-card">
        <header>
          <span>Administración · Persoas</span>
          <h2>Alta por invitación</h2>
          <p>Créase unha fila real en Persoas como PENDENTE. A persoa completará esa mesma ficha mediante unha ligazón segura.</p>
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
    style.textContent = `#scpp-invite-panel[hidden]{display:none!important}#scpp-invite-panel{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:1rem;background:rgba(31,25,24,.52)}.scpp-invite-card{width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;border:1px solid #d8d1cb;padding:1.35rem;box-shadow:0 18px 55px rgba(0,0,0,.22)}.scpp-invite-card form{display:grid;gap:.85rem}.scpp-invite-card label{display:grid;gap:.35rem}.scpp-invite-card input{width:100%;min-height:2.8rem;padding:.6rem .75rem;border:1px solid #cfc8c2}.scpp-invite-card footer{display:flex;justify-content:flex-end;gap:.65rem;flex-wrap:wrap}.scpp-invite-state[data-error="true"]{color:#8b2530}.scpp-alta-pending-badge{display:inline-flex;align-items:center;padding:.28rem .55rem;border:1px solid #a47b28;border-radius:999px;background:#fff8e8;color:#6e5018;font-size:.72rem;font-weight:800;letter-spacing:.02em}`;
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

    const nome = String(panel.querySelector('#invite-name')?.value || '').trim();
    const correo = String(panel.querySelector('#invite-email')?.value || '').trim();
    const telefono = String(panel.querySelector('#invite-phone')?.value || '').trim();
    if (!nome || !correo || !telefono) {
      state('Nome, correo e teléfono son obrigatorios.', true);
      return;
    }
    if (!lastIdToken) {
      state('Non se puido recuperar a sesión administrativa. Recarga a páxina e inténtao de novo.', true);
      return;
    }

    resetGenerated();
    generatedEmail = correo;
    creating = true;
    setBusy(true);
    state('Creando alta PENDENTE en Persoas…');

    try {
      const createResponse = await previousFetch('/api/persoas-alta-invitacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: lastIdToken, nome, correo, telefono })
      });
      const created = await createResponse.json().catch(() => null);
      if (!createResponse.ok || created?.ok !== true || !created?.idPersoa) {
        throw new Error(created?.erro || 'Non foi posible crear a alta por invitación.');
      }

      altaStates.set(String(created.idPersoa), 'PENDENTE');
      statesLoadedForToken = '';
      state('Alta PENDENTE creada. Xerando ligazón segura…');
      const link = await generateReview(String(created.idPersoa));
      showGeneratedLink(link);
      state('Ligazón xerada correctamente. Revísaa antes de enviar o correo.');
      void loadAltaStates(true);
    } catch (error) {
      state(error instanceof Error ? error.message : 'Non foi posible preparar a invitación.', true);
    } finally {
      creating = false;
      setBusy(false);
    }
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

  document.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.id === 'person-select') {
      queueMicrotask(renderAltaBadge);
    }
  });

  const observer = new MutationObserver(() => {
    injectButton();
    renderPendingOptions();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { injectButton(); renderPendingOptions(); }, { once: true });
  else { injectButton(); renderPendingOptions(); }
})();
