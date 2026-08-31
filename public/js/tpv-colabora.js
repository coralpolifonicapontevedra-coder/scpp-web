(() => {
  const form = document.querySelector('[data-tpv-form]');
  if (!(form instanceof HTMLFormElement)) return;
  const amountInput = form.elements.namedItem('amount');
  const status = form.querySelector('[data-tpv-status]');
  const submit = form.querySelector('button[type="submit"]');
  const locale = form.dataset.locale === 'gl' ? 'gl' : 'es';

  form.querySelectorAll('[data-amount]').forEach((button) => {
    button.addEventListener('click', () => {
      if (amountInput instanceof HTMLInputElement) amountInput.value = button.dataset.amount || '';
      form.querySelectorAll('[data-amount]').forEach((item) => item.classList.toggle('is-selected', item === button));
    });
  });
  amountInput?.addEventListener('input', () => form.querySelectorAll('[data-amount]').forEach((item) => item.classList.remove('is-selected')));

  function show(message, state) {
    if (!(status instanceof HTMLElement)) return;
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (submit instanceof HTMLButtonElement) submit.disabled = true;
    show(locale === 'gl' ? 'Preparando a conexión segura…' : 'Preparando la conexión segura…', 'loading');
    const data = new FormData(form);
    try {
      const response = await fetch('/api/tpv/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: data.get('amount'), method: data.get('method'), website: data.get('website'), locale })
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.action || !result.fields) throw new Error(result.error || 'No se pudo iniciar el pago.');
      const redirect = document.createElement('form');
      redirect.method = 'POST';
      redirect.action = result.action;
      Object.entries(result.fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = name; input.value = String(value);
        redirect.appendChild(input);
      });
      document.body.appendChild(redirect);
      redirect.submit();
    } catch (error) {
      show(error instanceof Error ? error.message : (locale === 'gl' ? 'Non se puido iniciar o pago.' : 'No se pudo iniciar el pago.'), 'error');
      if (submit instanceof HTMLButtonElement) submit.disabled = false;
    }
  });
})();

