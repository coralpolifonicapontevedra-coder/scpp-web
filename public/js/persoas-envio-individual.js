(() => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== '/portal/administracion/persoas') return;

  if (!document.querySelector('script[data-scpp-persoas-invitacion-v3]')) {
    const invitationScript = document.createElement('script');
    invitationScript.src = '/js/persoas-alta-invitacion-v3.js';
    invitationScript.defer = true;
    invitationScript.dataset.scppPersoasInvitacionV3 = 'true';
    document.head.append(invitationScript);
  }

  const originalFetch = window.fetch.bind(window);
  const WRITE_ACTIONS = new Map([
    ['crearPersoaAdministracion', 'crear'],
    ['actualizarPersoaAdministracion', 'actualizar'],
    ['cambiarEstadoPersoaAdministracion', 'estado']
  ]);
  const PENDING_SURNAME = '__SCPP_PENDENTE_APELIDO__';
  let lastIdToken = '';

  function rememberToken(body) {
    const token = String(body?.idToken || '').trim();
    if (!token) return;
    lastIdToken = token;
    window.__SCPP_PERSOAS_ID_TOKEN = token;
  }

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
    const button = document.querySelector('#open-file');
    if (!(button instanceof HTMLButtonElement)) return;
    if (!button.hidden) button.title = 'Abrir a ficha escaneada dispoñible en R2';
  }

  function ensurePhotoField() {
    if (document.querySelector('#f-foto-perfil')) return;
    const form = document.querySelector('#person-form');
    if (!(form instanceof HTMLFormElement)) return;
    const privacy = Array.from(form.querySelectorAll('fieldset')).find((fieldset) =>
      String(fieldset.querySelector('legend')?.textContent || '').trim() === 'Privacidade e presenza pública'
    );
    if (!(privacy instanceof HTMLFieldSetElement)) return;

    const fieldset = document.createElement('fieldset');
    fieldset.id = 'foto-perfil-fieldset';
    fieldset.innerHTML = `
      <legend>Fotografía de perfil</legend>
      <div class="form-grid">
        <label class="wide">
          <span>Fotografía (opcional)</span>
          <input id="f-foto-perfil" type="file" accept="image/jpeg,image/png,image/webp" />
          <small>JPG, PNG ou WebP · máximo 5 MB. Gardarase de forma privada. O consentimento para publicala xestiónase por separado.</small>
        </label>
      </div>`;
    privacy.before(fieldset);
  }

  function pendingPhoto() {
    const input = document.querySelector('#f-foto-perfil');
    return input instanceof HTMLInputElement ? (input.files?.[0] || null) : null;
  }

  async function uploadAdminPhoto(idToken, idPersoa, file) {
    if (!file) return { ok: true };
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return { ok: false, erro: 'A fotografía debe ser JPG, PNG ou WebP.' };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false, erro: 'A fotografía non pode superar 5 MB.' };
    }
    const form = new FormData();
    form.set('idToken', idToken);
    form.set('idPersoa', idPersoa);
    form.set('foto', file, file.name);
    const response = await originalFetch('/api/persoas-novo-foto', { method: 'POST', body: form });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      return { ok: false, erro: String(result?.erro || 'Non foi posible gardar a fotografía.') };
    }
    return { ok: true };
  }

  function alphabeticalName(text) {
    return String(text || '').split(' · ')[0].trim();
  }

  function sortPersonSelect() {
    const select = document.querySelector('#person-select');
    if (!(select instanceof HTMLSelectElement) || select.options.length < 3) return;
    const current = select.value;
    const placeholder = select.options[0];
    const options = Array.from(select.options).slice(1).sort((a, b) =>
      alphabeticalName(a.textContent).localeCompare(alphabeticalName(b.textContent), 'gl', { sensitivity: 'base', numeric: true })
    );
    select.replaceChildren(placeholder, ...options);
    if (current && options.some((option) => option.value === current)) select.value = current;
  }

  function scheduleSort() {
    window.setTimeout(sortPersonSelect, 0);
    window.setTimeout(sortPersonSelect, 80);
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
      if (button instanceof HTMLButtonElement) { button.disabled = false; button.textContent = 'Enviar por correo'; }
    }
  }

  async function routeWrite(body) {
    const requested = WRITE_ACTIONS.get(String(body?.accion || ''));
    if (!requested) return null;
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) return new Response(JSON.stringify({ ok: false, erro: 'Sesión non válida' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    let action = requested;
    if (requested === 'crear' && String(body?.persoa?.primeiroApelido || '') === PENDING_SURNAME) action = 'crearInvitacion';

    const payload = { idToken, accion: action };
    if (body?.persoa && typeof body.persoa === 'object') payload.persoa = body.persoa;
    if (body?.idPersoa) payload.idPersoa = body.idPersoa;
    if (typeof body?.activo === 'boolean') payload.activo = body.activo;

    const response = await originalFetch('/api/persoas-novo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      return new Response(JSON.stringify(result || { ok: false, erro: `Erro HTTP ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
      });
    }

    if (action === 'crear' || action === 'actualizar') {
      const idPersoa = String(result?.idPersoa || body?.idPersoa || '').trim();
      const file = pendingPhoto();
      if (file && idPersoa) {
        const photo = await uploadAdminPhoto(idToken, idPersoa, file);
        if (photo.ok) result.mensaxe = action === 'crear' ? 'Persoa e fotografía gardadas.' : 'Datos e fotografía actualizados.';
        else result.mensaxe = `Os datos gardáronse, pero a fotografía non: ${photo.erro}`;
      }
    }

    scheduleSort();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
    });
  }

  window.fetch = async function patchedFetch(input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : String(input?.url || ''); }
    catch { return originalFetch(input, init); }

    let body = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }

    if (url.includes('/api/persoas-v2')) {
      rememberToken(body);
      const routed = await routeWrite(body);
      if (routed) return routed;
      const response = await originalFetch(input, init);
      if (body?.accion === 'listarPersoasAdministracion' && response.ok) scheduleSort();
      return response;
    }

    if (!url.includes('/api/persoas-revision') || url.includes('/api/persoas-revision-envio')) {
      return originalFetch(input, init);
    }

    const response = await originalFetch(input, init);
    if (body?.accion === 'xerarLigazon' && response.ok) {
      rememberToken(body);
      ensureSendButton();
      setReviewMessage('Ligazón xerada. Podes enviala por correo ou copiala manualmente.');
    }
    return response;
  };

  document.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.id === 'person-select') queueMicrotask(syncFileButton);
    if (event.target instanceof HTMLSelectElement && ['status-filter', 'relation-filter', 'voice-filter'].includes(event.target.id)) scheduleSort();
  });
  document.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'people-search') scheduleSort();
  });

  ensurePhotoField();
  ensureSendButton();
  syncFileButton();
  scheduleSort();
  document.addEventListener('DOMContentLoaded', () => {
    ensurePhotoField();
    ensureSendButton();
    syncFileButton();
    scheduleSort();
  }, { once: true });
})();
