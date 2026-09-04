(() => {
  const path = window.location.pathname.replace(/\/+$/, '');
  const originalFetch = window.fetch.bind(window);

  function dataUrlParts(value) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(String(value || '').trim());
    return match ? { mimeType: match[1].toLowerCase(), base64: match[2] } : null;
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Non foi posible ler a fotografía de R2.'));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchProfilePhoto(idToken) {
    return originalFetch('/api/perfil-foto-r2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, accion: 'descargar' })
    });
  }

  async function saveProfilePhoto(idToken, fotoBase64, fotoTipo) {
    const response = await originalFetch('/api/perfil-foto-r2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, accion: 'gardar', fotoBase64, fotoTipo })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.erro || 'Non foi posible gardar a fotografía en R2.');
    }
    return result;
  }

  async function overlayProfilePhoto(result, idToken, newPhoto = null) {
    if (!result?.ok || !result?.perfil || !idToken) return result;
    const profile = { ...result.perfil };

    if (newPhoto?.base64) {
      await saveProfilePhoto(idToken, newPhoto.base64, newPhoto.mimeType);
      profile.fotoDataUrl = `data:${newPhoto.mimeType};base64,${newPhoto.base64}`;
      profile.fotoFonte = 'R2';
      return { ...result, perfil: profile };
    }

    const r2 = await fetchProfilePhoto(idToken);
    if (r2.ok) {
      profile.fotoDataUrl = await blobToDataUrl(await r2.blob());
      profile.fotoFonte = 'R2';
      return { ...result, perfil: profile };
    }

    const legacy = dataUrlParts(profile.fotoDataUrl);
    if (legacy && ['image/jpeg', 'image/png', 'image/webp'].includes(legacy.mimeType)) {
      try {
        await saveProfilePhoto(idToken, legacy.base64, legacy.mimeType);
        profile.fotoFonte = 'R2';
      } catch {
        // A foto histórica segue visible; a migración poderá repetirse na seguinte carga.
      }
    }
    return { ...result, perfil: profile };
  }

  if (path === '/portal/perfil') {
    window.fetch = async function profileFetch(input, init) {
      let url = '';
      try { url = typeof input === 'string' ? input : String(input?.url || ''); }
      catch { return originalFetch(input, init); }
      if (!/\/api\/perfil(?:\?|$)/.test(url)) return originalFetch(input, init);

      let body = null;
      try { body = init?.body ? JSON.parse(String(init.body)) : null; }
      catch { body = null; }
      if (!body?.idToken) return originalFetch(input, init);

      const newPhoto = body?.accion === 'actualizarPerfil' && body?.fotoBase64
        ? { base64: String(body.fotoBase64 || ''), mimeType: String(body.fotoTipo || '').toLowerCase() }
        : null;

      const forwarded = { ...body };
      delete forwarded.fotoBase64;
      delete forwarded.fotoTipo;
      delete forwarded.fotoNome;

      const response = await originalFetch(input, {
        ...init,
        headers: { ...(init?.headers || {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(forwarded)
      });
      const result = await response.clone().json().catch(() => null);
      if (!response.ok || !result?.ok || !result?.perfil) return response;

      try {
        const overlaid = await overlayProfilePhoto(result, String(body.idToken || ''), newPhoto);
        const headers = new Headers(response.headers);
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.set('Cache-Control', 'private, no-store');
        headers.set('X-SCPP-Photo-Source', overlaid?.perfil?.fotoFonte || 'LEGACY');
        return new Response(JSON.stringify(overlaid), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (error) {
        console.warn('Non se puido sincronizar a fotografía de Perfil con R2:', error);
        if (newPhoto) {
          return new Response(JSON.stringify({
            ok: false,
            parcial: true,
            erro: 'Os datos gardáronse, pero non foi posible actualizar a fotografía en R2. Tenta gardar de novo a fotografía.',
            detalle: error instanceof Error ? error.message : ''
          }), {
            status: 502,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'private, no-store',
              'X-SCPP-Photo-Source': 'R2-ERROR'
            }
          });
        }
        return response;
      }
    };
    return;
  }

  if (path === '/revision-datos') {
    if (!document.querySelector('script[data-scpp-exencion-cota]')) {
      const script = document.createElement('script');
      script.src = '/js/persoas-exencion-revision.js';
      script.defer = true;
      script.dataset.scppExencionCota = '1';
      document.head.append(script);
    }
    return;
  }

  if (path !== '/portal/administracion/persoas') return;

  let lastIdToken = '';
  let lastReviewEmail = '';
  let envioEnCurso = false;
  let envioCompletado = false;

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
    const direct = String(lastReviewEmail || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(direct)) return direct;

    const sections = document.querySelectorAll('#person-sections .data-section');
    for (const section of sections) {
      const terms = section.querySelectorAll('dt');
      for (const term of terms) {
        if (String(term.textContent || '').trim() !== 'Correo electrónico') continue;
        const valueNode = term.nextElementSibling;
        const value = valueNode?.tagName === 'DD'
          ? String(valueNode.textContent || '').trim().toLowerCase()
          : '';
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : '';
      }
    }
    return '';
  }

  function setReviewMessage(message) {
    const node = reviewState();
    if (node instanceof HTMLElement) node.textContent = message;
  }

  function ensureSendButton() {
    const footerActions = document.querySelector('#review-dialog .dialog-footer > div');
    if (!(footerActions instanceof HTMLElement)) return null;

    let button = document.querySelector('#send-review-email');
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement('button');
      button.id = 'send-review-email';
      button.type = 'button';
      button.className = 'primary-action';
      footerActions.prepend(button);
      button.addEventListener('click', sendReviewEmail);
    }

    button.disabled = envioEnCurso || envioCompletado;
    button.textContent = envioCompletado ? 'Enviado' : (envioEnCurso ? 'Enviando…' : 'Enviar por correo');
    return button;
  }

  async function sendReviewEmail() {
    if (envioEnCurso || envioCompletado) return;
    const button = ensureSendButton();
    const linkNode = reviewLink();
    const ligazon = linkNode instanceof HTMLInputElement ? linkNode.value.trim() : '';
    const correo = selectedEmail();

    if (!ligazon) {
      setReviewMessage('Primeiro tes que xerar a ligazón de revisión.');
      return;
    }
    if (!lastIdToken) {
      setReviewMessage('Non foi posible recuperar a sesión. Pecha esta xanela e xera de novo a revisión.');
      return;
    }
    if (!correo) {
      setReviewMessage('A persoa seleccionada non ten un correo electrónico válido na ficha.');
      return;
    }

    const ok = window.confirm(
      `Vas enviar a revisión de datos a ${personName()}.\n\nCorreo: ${correo}\n\nQueres continuar?`
    );
    if (!ok) return;

    envioEnCurso = true;
    ensureSendButton();
    setReviewMessage('Enviando correo…');

    try {
      const response = await originalFetch('/api/persoas-revision-envio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: lastIdToken, ligazons: [ligazon] })
      });
      const result = await response.json().catch(() => null);
      const enviados = Number(result?.envio?.enviados || 0);

      if (!response.ok || result?.ok !== true || enviados < 1) {
        const motivo = String(
          result?.erro ||
          result?.envio?.erro ||
          result?.envio?.detalle?.[0]?.motivo ||
          'Non foi posible enviar o correo.'
        ).trim();
        throw new Error(motivo);
      }

      envioCompletado = true;
      const destino = String(result?.envio?.detalle?.[0]?.correo || correo).trim();
      setReviewMessage(destino ? `Correo enviado correctamente a ${destino}.` : 'Correo enviado correctamente.');
    } catch (error) {
      setReviewMessage(error instanceof Error ? error.message : 'Non foi posible enviar o correo.');
    } finally {
      envioEnCurso = false;
      ensureSendButton();
    }
  }

  window.fetch = async function patchedFetch(input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : String(input?.url || ''); }
    catch { return originalFetch(input, init); }

    if (!url.includes('/api/persoas-revision') || url.includes('/api/persoas-revision-envio')) {
      return originalFetch(input, init);
    }

    let body = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; }
    catch { body = null; }

    const useV4Generator = body?.accion === 'xerarLigazon' && /\/api\/persoas-revision(?:\?|$)/.test(url);
    const destination = useV4Generator ? '/api/persoas-revision-link-v4' : input;
    const response = await originalFetch(destination, init);
    if (body?.accion === 'xerarLigazon' && response.ok) {
      lastIdToken = String(body?.idToken || '').trim();
      const generated = await response.clone().json().catch(() => null);
      lastReviewEmail = String(generated?.correo || '').trim().toLowerCase();
      envioCompletado = false;
      envioEnCurso = false;
      ensureSendButton();
      setReviewMessage('Ligazón xerada. Podes enviala por correo ou copiala manualmente.');
    }
    return response;
  };

  ensureSendButton();
  document.addEventListener('DOMContentLoaded', ensureSendButton, { once: true });
})();
