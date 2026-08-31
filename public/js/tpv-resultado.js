(() => {
  const root = document.querySelector('[data-payment-result="correct"]');
  const message = root?.querySelector('[data-result-message]');
  const operation = new URLSearchParams(window.location.search).get('operacion');
  const isGl = root?.getAttribute('data-lang') === 'gl';
  if (!(message instanceof HTMLElement) || !operation || !/^[a-zA-Z0-9]{1,50}$/.test(operation)) return;
  fetch(`/api/tpv/estado?operacion=${encodeURIComponent(operation)}`, { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : null)
    .then((result) => {
      if (result?.status === 'paid') {
        message.textContent = isGl
          ? `A pasarela confirmou correctamente a túa colaboración de ${result.amount} €.`
          : `La pasarela ha confirmado correctamente tu colaboración de ${result.amount} €.`;
      } else {
        message.textContent = isGl
          ? 'A operación regresou correctamente, pero a confirmación bancaria aínda está pendente. Se fixeches o pago, quedará rexistrado ao recibirmos a comunicación segura.'
          : 'La operación ha regresado correctamente, pero la confirmación bancaria aún está pendiente. Si realizaste el pago, quedará registrado al recibir la comunicación segura.';
      }
    })
    .catch(() => {});
})();

