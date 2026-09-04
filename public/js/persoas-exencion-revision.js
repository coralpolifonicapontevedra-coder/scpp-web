(() => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== '/revision-datos') return;

  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (!token) return;

  async function cargar() {
    try {
      const response = await fetch(`/api/persoas-exencion-cota?token=${encodeURIComponent(token)}`, {
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
      kicker.textContent = 'Cota social';
      const title = document.createElement('h2');
      title.id = 'fee-exemption-title';
      title.textContent = String(texto.titulo || 'Exención do pagamento da cota social');
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
      note.textContent = 'Este aviso é informativo e serve para indicar, cando corresponda, a situación de exención da cota. Non é necesario declarar o importe concreto dos ingresos.';
      card.append(note);

      legalPrincipal.parentElement?.insertBefore(card, legalPrincipal);
    } catch (error) {
      console.warn('Non foi posible cargar o aviso de exención da cota:', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cargar, { once: true });
  else void cargar();
})();
