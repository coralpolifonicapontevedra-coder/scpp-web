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

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  async function esperarTextoPrincipal() {
    for (let i = 0; i < 30; i += 1) {
      const legal = document.querySelector('#review-form .legal-card');
      if (legal instanceof HTMLElement) return legal;
      await sleep(100);
    }
    return null;
  }

  function crearTarxeta(legalPrincipal) {
    let card = document.querySelector('#fee-exemption-card');
    if (card instanceof HTMLElement) return card;
    card = document.createElement('section');
    card.id = 'fee-exemption-card';
    card.className = 'legal-card';
    card.setAttribute('aria-labelledby', 'fee-exemption-title');
    legalPrincipal.insertAdjacentElement('afterend', card);
    return card;
  }

  function renderTexto(card, texto) {
    card.replaceChildren();
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
    body.style.maxHeight = '18rem';
    body.style.overflowY = 'auto';
    body.style.paddingRight = '.35rem';
    card.append(header, body);

    const note = document.createElement('p');
    note.className = 'privacy-note';
    note.style.marginTop = '1rem';
    note.textContent = 'Esta información sobre a cota social é de carácter informativo e non require unha aceptación independente.';
    card.append(note);
  }

  function renderErro(card, message) {
    card.replaceChildren();
    const header = document.createElement('header');
    const kicker = document.createElement('span');
    kicker.className = 'section-kicker';
    kicker.textContent = 'Información sobre a cota social';
    const title = document.createElement('h2');
    title.id = 'fee-exemption-title';
    title.textContent = 'Non foi posible cargar a información da cota';
    header.append(kicker, title);
    const body = document.createElement('p');
    body.className = 'privacy-note';
    body.style.margin = '1rem 0 0';
    body.textContent = message || 'A información da cota non está dispoñible neste momento. Non continúes coa confirmación e comunícao á Sociedade Coral.';
    card.append(header, body);
  }

  async function cargar() {
    const legalPrincipal = await esperarTextoPrincipal();
    if (!(legalPrincipal instanceof HTMLElement)) return;
    const card = crearTarxeta(legalPrincipal);

    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await originalFetch(`/api/persoas-exencion-cota?token=${encodeURIComponent(token)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.ok === true && result?.textoExencionCota?.texto) {
          renderTexto(card, result.textoExencionCota);
          return;
        }
        lastError = String(result?.erro || `Erro HTTP ${response.status}`).trim();
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Erro de conexión.';
      }
      if (attempt < 2) await sleep(350 * (attempt + 1));
    }
    renderErro(card, lastError);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cargar, { once: true });
  else void cargar();
})();