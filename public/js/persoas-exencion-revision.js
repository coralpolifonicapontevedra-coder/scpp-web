(() => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== '/revision-datos') return;

  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (!token) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function reviewFetch(input, init) {
    const response = await originalFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method === 'POST' && /\/api\/persoas-revision(?:\?|$)/.test(url) && response.ok) {
        let body = null;
        try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }
        if (body?.accion === 'gardarRevision') {
          const saved = await response.clone().json().catch(() => null);
          if (saved?.ok === true) {
            const sync = await originalFetch('/api/persoas-review-cache-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token })
            });
            if (!sync.ok) console.warn('A revisión gardouse, pero a actualización inmediata da cache non respondeu correctamente.');
          }
        }
      }
    } catch (error) {
      console.warn('Non foi posible refrescar a cache despois da revisión:', error);
    }
    return response;
  };

  async function cargar() {
    try {
      const response = await originalFetch(`/api/persoas-exencion-cota?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true || !result?.textoExencionCota?.texto) return;

      const legalPrincipal = document.querySelector('#review-form .legal-card');
      if (!(legalPrincipal instanceof HTMLElement) || document.querySelector('#fee-exemption-card')) return;

      const texto = result.textoExencionCota;
      const card = document.createElement('section');
      card.id = 'fee-exemption-card';
      card.className = 'legal-card';
      card.setAttribute('aria-labelledby', 'fee-exemption-title');

      const header = document.createElement('header');
      const kicker = document.createElement('span');
      kicker.className = 'section-kicker';
      kicker.textContent = 'Información sobre a cota social';
      const title = document.createElement('h2');
      title.id = 'fee-exemption-title';
      title.textContent = String(texto.titulo || 'Pagamento da cota social');
      const meta = document.createElement('p');
      meta.textContent = [
        texto.version ? `Versión ${texto.version}` : '',
        texto.dataVixencia ? `vixente desde ${texto.dataVixencia}` : ''
      ].filter(Boolean).join(' · ');
      header.append(kicker, title, meta);

      const body = document.createElement('div');
      body.className = 'legal-text';
      body.textContent = String(texto.texto || '');
      card.append(header, body);

      const note = document.createElement('p');
      note.className = 'privacy-note';
      note.textContent = 'Esta información sobre a cota social é de carácter informativo e non require unha aceptación independente.';
      card.append(note);

      legalPrincipal.insertAdjacentElement('afterend', card);
    } catch (error) {
      console.warn('Non foi posible cargar a información sobre a cota social:', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cargar, { once: true });
  else void cargar();
})();