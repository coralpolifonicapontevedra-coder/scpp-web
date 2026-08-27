(() => {
  if (window.__scppAdminFotosFallback) return;
  window.__scppAdminFotosFallback = true;

  const fetchAnterior = window.fetch.bind(window);
  const timers = new Map();
  const urls = new Map();
  let idToken = '';

  const texto = (valor = '') => String(valor ?? '').trim();

  function bodyJson(init) {
    if (!init || typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); }
    catch { return null; }
  }

  function idDialogo() {
    const link = document.querySelector('#open-editor');
    if (!(link instanceof HTMLAnchorElement)) return '';
    try {
      return texto(new URL(link.href, window.location.href).searchParams.get('idFoto'));
    } catch {
      return '';
    }
  }

  function aplicar(id, src) {
    document.querySelectorAll(`[data-thumb-id="${CSS.escape(id)}"]`).forEach((node) => {
      if (node instanceof HTMLImageElement && !node.classList.contains('is-ready')) {
        if (node.getAttribute('src') !== src) node.src = src;
        node.classList.add('is-ready');
        node.dataset.fallbackOriginal = 'true';
      }
    });

    if (idDialogo() === id) {
      const image = document.querySelector('#dialog-image');
      const placeholder = document.querySelector('#dialog-image-placeholder');
      if (image instanceof HTMLImageElement) {
        if (image.getAttribute('src') !== src) image.src = src;
        if (image.hidden) image.hidden = false;
      }
      if (placeholder instanceof HTMLElement && !placeholder.hidden) placeholder.hidden = true;
    }
  }

  async function cargarFallback(id, intento = 0) {
    timers.delete(id);
    const nodes = [...document.querySelectorAll(`[data-thumb-id="${CSS.escape(id)}"]`)];
    if (!nodes.some((node) => node instanceof HTMLImageElement && !node.classList.contains('is-ready'))) return;

    if (!idToken) {
      if (intento < 12) {
        timers.set(id, window.setTimeout(() => cargarFallback(id, intento + 1), 400));
      }
      return;
    }

    try {
      const response = await fetchAnterior(`/api/editor-fotos-miniatura?idFoto=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store'
      });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.size || !String(blob.type || '').startsWith('image/')) return;

      const anterior = urls.get(id);
      if (anterior) URL.revokeObjectURL(anterior);
      const src = URL.createObjectURL(blob);
      urls.set(id, src);
      aplicar(id, src);
    } catch (error) {
      console.warn('Non se puido cargar a miniatura de respaldo:', id, error);
    }
  }

  function programar(id) {
    if (!id || timers.has(id) || urls.has(id)) return;
    timers.set(id, window.setTimeout(() => cargarFallback(id), 1400));
  }

  function revisar() {
    document.querySelectorAll('.photo-thumb[data-thumb-id]').forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return;
      const id = texto(node.dataset.thumbId);
      if (!id) return;
      const src = urls.get(id);
      if (src) aplicar(id, src);
      else if (!node.classList.contains('is-ready')) programar(id);
    });

    const actual = idDialogo();
    if (actual && urls.has(actual)) aplicar(actual, urls.get(actual));
  }

  window.fetch = async (input, init) => {
    const body = bodyJson(init);
    if (body?.idToken) idToken = texto(body.idToken);
    const response = await fetchAnterior(input, init);
    window.setTimeout(revisar, 0);
    window.setTimeout(revisar, 250);
    return response;
  };

  const iniciar = () => {
    revisar();
    const observer = new MutationObserver(() => revisar());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'href']
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();

  window.addEventListener('beforeunload', () => {
    for (const timer of timers.values()) window.clearTimeout(timer);
    for (const src of urls.values()) URL.revokeObjectURL(src);
    timers.clear();
    urls.clear();
  }, { once: true });
})();
