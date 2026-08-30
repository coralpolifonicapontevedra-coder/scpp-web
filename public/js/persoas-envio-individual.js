(() => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== '/portal/administracion/persoas') return;

  const productionHosts = new Set([
    'coralpolifonicapontevedra.org',
    'www.coralpolifonicapontevedra.org'
  ]);
  if (!productionHosts.has(window.location.hostname.toLowerCase())) return;

  const originalFetch = window.fetch.bind(window);
  let envioEnCurso = false;

  function reviewButton() {
    return document.querySelector('#review-person');
  }

  function reviewState() {
    return document.querySelector('#review-state');
  }

  function reviewIntro() {
    return document.querySelector('#review-dialog .review-dialog-body > p');
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

  function setIntro(message) {
    const node = reviewIntro();
    if (node instanceof HTMLElement) node.textContent = message;
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('#review-person')) return;

    const correo = selectedEmail();
    const destino = correo ? `\n\nCorreo: ${correo}` : '';
    const ok = window.confirm(
      `Vas xerar e enviar por correo unha revisión de datos a ${personName()}.${destino}\n\nQueres continuar?`
    );
    if (ok) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.fetch = async function patchedFetch(input, init) {
    let url = '';
    try {
      url = typeof input === 'string' ? input : String(input?.url || '');
    } catch {
      return originalFetch(input, init);
    }

    if (!url.includes('/api/persoas-revision') || url.includes('/api/persoas-revision-envio')) {
      return originalFetch(input, init);
    }

    let body = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = null;
    }

    const response = await originalFetch(input, init);
    if (body?.accion !== 'xerarLigazon' || !response.ok || envioEnCurso) return response;

    try {
      const generated = await response.clone().json();
      const ligazon = String(generated?.ligazon || '').trim();
      const idToken = String(body?.idToken || '').trim();
      if (!ligazon || !idToken) return response;

      envioEnCurso = true;
      setIntro('A ligazón foi xerada. Enviando o correo á persoa interesada…');
      setReviewMessage('Enviando correo…');

      const envioResponse = await originalFetch('/api/persoas-revision-envio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, ligazons: [ligazon] })
      });
      const envioResult = await envioResponse.json().catch(() => null);

      const enviados = Number(envioResult?.envio?.enviados || 0);
      if (!envioResponse.ok || envioResult?.ok !== true || enviados < 1) {
        const motivo = String(
          envioResult?.erro ||
          envioResult?.envio?.erro ||
          envioResult?.envio?.detalle?.[0]?.motivo ||
          'Non foi posible confirmar o envío do correo.'
        ).trim();
        setIntro('A ligazón quedou xerada e podes copiala ou abrila manualmente.');
        setReviewMessage(motivo);
        return response;
      }

      const correo = String(envioResult?.envio?.detalle?.[0]?.correo || selectedEmail()).trim();
      setIntro('A ligazón segura foi enviada por correo á persoa interesada.');
      setReviewMessage(correo ? `Correo enviado correctamente a ${correo}.` : 'Correo enviado correctamente.');
    } catch (error) {
      setIntro('A ligazón quedou xerada e podes copiala ou abrila manualmente.');
      setReviewMessage(error instanceof Error ? error.message : 'Non foi posible confirmar o envío do correo.');
    } finally {
      envioEnCurso = false;
    }

    return response;
  };
})();
