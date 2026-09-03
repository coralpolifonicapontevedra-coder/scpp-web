(() => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== '/revision-datos') return;

  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) return;

  const previousFetch = window.fetch.bind(window);

  window.fetch = async function reviewCompletionFetch(input, init) {
    let isSave = false;
    try {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      if (url.includes('/api/persoas-revision') && init?.method === 'POST' && init?.body) {
        const body = JSON.parse(String(init.body));
        isSave = body?.accion === 'gardarRevision' && String(body?.token || '') === token;
      }
    } catch {
      isSave = false;
    }

    const response = await previousFetch(input, init);
    if (!isSave || !response.ok) return response;

    try {
      const saved = await response.clone().json().catch(() => null);
      if (saved?.ok === true) {
        const completion = await previousFetch('/api/persoas-alta-completar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const result = await completion.json().catch(() => null);
        if (!completion.ok || result?.ok !== true) {
          console.error('A revisión gardouse, pero non se puido actualizar EstadoAlta:', result?.erro || completion.status);
        }
      }
    } catch (error) {
      console.error('Non se puido completar EstadoAlta tras a revisión:', error);
    }

    return response;
  };

  function makePhotoSection() {
    const form = document.querySelector('#review-form');
    if (!(form instanceof HTMLFormElement) || document.querySelector('#scpp-photo-fieldset')) return;

    const privacyFieldset = Array.from(form.querySelectorAll('fieldset')).find((item) =>
      String(item.querySelector('legend')?.textContent || '').includes('Privacidade'));
    if (!(privacyFieldset instanceof HTMLElement)) return;

    const fieldset = document.createElement('fieldset');
    fieldset.id = 'scpp-photo-fieldset';
    fieldset.innerHTML = `
      <legend>Fotografía da ficha</legend>
      <div class="scpp-photo-box">
        <div id="scpp-photo-current" class="scpp-photo-current" hidden>
          <img id="scpp-photo-preview" alt="Fotografía actual da ficha" />
          <span>Fotografía actual dispoñible.</span>
        </div>
        <label class="scpp-photo-label">
          <span>Engadir ou substituír fotografía (opcional)</span>
          <input id="scpp-photo-input" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <small>A fotografía úsase como imaxe privada da ficha. Subila non implica autorizar a súa publicación. O consentimento de fotografía mantense separado.</small>
        <p id="scpp-photo-state" role="status"></p>
      </div>`;
    privacyFieldset.before(fieldset);

    const style = document.createElement('style');
    style.textContent = `
      .scpp-photo-box{display:grid;gap:.85rem;padding:.15rem 0}.scpp-photo-current{display:flex;gap:1rem;align-items:center}.scpp-photo-current img{width:92px;height:112px;object-fit:cover;border:1px solid #d8d1cb;border-radius:4px;background:#fff}.scpp-photo-label{display:grid;gap:.45rem}.scpp-photo-label>span{font-size:.76rem;font-weight:800;text-transform:uppercase}.scpp-photo-label input{min-height:auto;padding:.65rem}.scpp-photo-box small{color:#6d6763;line-height:1.45}.scpp-photo-box p{margin:0;color:#625c58;font-size:.9rem}`;
    document.head.append(style);

    document.querySelector('#scpp-photo-input')?.addEventListener('change', uploadPhoto);
    loadPhotoStatus();
  }

  async function loadPhotoStatus() {
    const current = document.querySelector('#scpp-photo-current');
    const preview = document.querySelector('#scpp-photo-preview');
    try {
      const response = await previousFetch(`/api/persoas-foto?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true || result?.disponible !== true) return;
      if (current instanceof HTMLElement) current.hidden = false;
      if (preview instanceof HTMLImageElement) {
        preview.src = `/api/persoas-foto?token=${encodeURIComponent(token)}&download=1&t=${Date.now()}`;
      }
    } catch {
      // A foto é opcional: un fallo aquí non debe impedir revisar os datos.
    }
  }

  async function uploadPhoto(event) {
    const input = event.currentTarget;
    const state = document.querySelector('#scpp-photo-state');
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      if (state instanceof HTMLElement) state.textContent = 'A fotografía non pode superar 5 MB.';
      input.value = '';
      return;
    }

    const form = new FormData();
    form.append('token', token);
    form.append('foto', file, file.name);
    input.disabled = true;
    if (state instanceof HTMLElement) state.textContent = 'Gardando fotografía…';

    try {
      const response = await previousFetch('/api/persoas-foto', { method: 'POST', body: form });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
      if (state instanceof HTMLElement) state.textContent = 'Fotografía gardada correctamente.';
      await loadPhotoStatus();
    } catch (error) {
      if (state instanceof HTMLElement) state.textContent = error instanceof Error ? error.message : 'Non foi posible gardar a fotografía.';
    } finally {
      input.disabled = false;
    }
  }

  const observer = new MutationObserver(() => makePhotoSection());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makePhotoSection, { once: true });
  else makePhotoSection();
})();
