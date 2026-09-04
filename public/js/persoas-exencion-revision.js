(() => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== '/revision-datos') return;

  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (!token) return;

  function ensureCard() {
    const legalCard = document.querySelector('.legal-card');
    if (!(legalCard instanceof HTMLElement)) return null;

    let card = document.querySelector('#exencion-cota-revision');
    if (card instanceof HTMLElement) return card;

    card = document.createElement('section');
    card.id = 'exencion-cota-revision';
    card.className = 'legal-card exencion-cota-revision-card';
    card.setAttribute('aria-labelledby', 'exencion-cota-revision-title');
    card.innerHTML = `
      <header>
        <span class="section-kicker">Cota social</span>
        <h2 id="exencion-cota-revision-title">Exención do pagamento da cota social</h2>
        <p id="exencion-cota-revision-version">Cargando o criterio vixente…</p>
      </header>
      <div id="exencion-cota-revision-text" class="legal-text"></div>`;
    legalCard.before(card);
    return card;
  }

  async function load() {
    const card = ensureCard();
    if (!card) return;
    const version = card.querySelector('#exencion-cota-revision-version');
    const text = card.querySelector('#exencion-cota-revision-text');

    try {
      const response = await fetch(`/api/persoas-exencion-cota?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true || !result?.textoExencionCota) {
        throw new Error(result?.erro || 'Non foi posible cargar o criterio de exención da cota.');
      }
      const info = result.textoExencionCota;
      if (version instanceof HTMLElement) {
        version.textContent = [
          info.version ? `Versión ${info.version}` : '',
          info.dataVixencia ? `vixente desde ${info.dataVixencia}` : ''
        ].filter(Boolean).join(' · ');
      }
      if (text instanceof HTMLElement) text.textContent = String(info.texto || '');
    } catch (error) {
      if (version instanceof HTMLElement) version.textContent = 'Texto non dispoñible';
      if (text instanceof HTMLElement) {
        text.textContent = error instanceof Error ? error.message : 'Non foi posible cargar o criterio de exención da cota.';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void load(); }, { once: true });
  } else {
    void load();
  }
})();
