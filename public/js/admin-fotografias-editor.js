(() => {
  if (window.__scppAdminFotosEditorIntegrado) return;
  window.__scppAdminFotosEditorIntegrado = true;

  const fetchBase = window.fetch.bind(window);
  let idToken = '';
  let instalado = false;
  let cropMode = false;
  let cropStart = null;
  let cropRect = null;
  const savedThumbs = new Map();

  const state = {
    id: '',
    active: false,
    dirty: false,
    originalDataUrl: '',
    mimeType: 'image/jpeg'
  };

  const texto = (value = '') => String(value ?? '').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function urlDe(input) {
    try {
      const value = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input || '');
      return new URL(value, window.location.href);
    } catch {
      return null;
    }
  }

  function bodyJson(init) {
    if (!init || typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); }
    catch { return null; }
  }

  function currentId() {
    const link = document.querySelector('#open-editor');
    if (!(link instanceof HTMLAnchorElement)) return '';
    try {
      return texto(new URL(link.href, window.location.href).searchParams.get('idFoto'));
    } catch {
      return '';
    }
  }

  function canvas() {
    return document.querySelector('#admin-photo-editor-canvas');
  }

  function context2d() {
    const element = canvas();
    return element instanceof HTMLCanvasElement ? element.getContext('2d') : null;
  }

  function editorShell() {
    return document.querySelector('#admin-photo-editor');
  }

  function dialogMessage() {
    return document.querySelector('#dialog-message');
  }

  function setMessage(message, error = false) {
    const target = dialogMessage();
    if (!(target instanceof HTMLElement)) return;
    target.textContent = message;
    target.dataset.error = error ? 'true' : 'false';
  }

  async function waitToken(maxMs = 10_000) {
    const started = Date.now();
    while (!idToken && Date.now() - started < maxMs) await sleep(80);
    if (!idToken) throw new Error('Non se puido preparar a sesión para editar a fotografía.');
    return idToken;
  }

  function imageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Non se puido abrir a fotografía.'));
      image.src = url;
    });
  }

  function drawImage(image) {
    const element = canvas();
    const ctx = context2d();
    if (!(element instanceof HTMLCanvasElement) || !ctx) return;
    const maxW = 2400;
    const maxH = 1800;
    const scale = Math.min(1, maxW / image.width, maxH / image.height);
    element.width = Math.max(1, Math.round(image.width * scale));
    element.height = Math.max(1, Math.round(image.height * scale));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, element.width, element.height);
    ctx.drawImage(image, 0, 0, element.width, element.height);
  }

  function resetCrop() {
    cropMode = false;
    cropStart = null;
    cropRect = null;
    const cropBox = document.querySelector('#admin-photo-crop-box');
    const apply = document.querySelector('#admin-photo-apply-crop');
    const stage = document.querySelector('#admin-photo-editor-stage');
    if (cropBox instanceof HTMLElement) cropBox.hidden = true;
    if (apply instanceof HTMLButtonElement) apply.disabled = true;
    stage?.classList.remove('is-cropping');
  }

  function markDirty(message = 'Edición preparada. Garda para aplicar os cambios.') {
    state.dirty = true;
    setMessage(message);
  }

  function pointerPosition(event) {
    const element = canvas();
    if (!(element instanceof HTMLCanvasElement)) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top))
    };
  }

  function drawCropBox() {
    const element = canvas();
    const cropBox = document.querySelector('#admin-photo-crop-box');
    if (!(element instanceof HTMLCanvasElement) || !(cropBox instanceof HTMLElement) || !cropRect) return;
    cropBox.hidden = false;
    cropBox.style.left = `${element.offsetLeft + cropRect.x}px`;
    cropBox.style.top = `${element.offsetTop + cropRect.y}px`;
    cropBox.style.width = `${cropRect.w}px`;
    cropBox.style.height = `${cropRect.h}px`;
  }

  async function rotate(degrees) {
    const element = canvas();
    if (!(element instanceof HTMLCanvasElement)) return;
    const source = await imageFromUrl(element.toDataURL('image/jpeg', 0.94));
    const swap = Math.abs(degrees) % 180 === 90;
    const temp = document.createElement('canvas');
    temp.width = swap ? source.height : source.width;
    temp.height = swap ? source.width : source.height;
    const ctx = temp.getContext('2d');
    if (!ctx) return;
    ctx.translate(temp.width / 2, temp.height / 2);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    const target = context2d();
    if (!target) return;
    element.width = temp.width;
    element.height = temp.height;
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, element.width, element.height);
    target.drawImage(temp, 0, 0);
    resetCrop();
    markDirty('Xiro aplicado. Garda para conservar o cambio.');
  }

  async function flip(axis) {
    const element = canvas();
    const ctx = context2d();
    if (!(element instanceof HTMLCanvasElement) || !ctx) return;
    const source = await imageFromUrl(element.toDataURL('image/jpeg', 0.94));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, element.width, element.height);
    ctx.translate(element.width / 2, element.height / 2);
    ctx.scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1);
    ctx.drawImage(source, -element.width / 2, -element.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    resetCrop();
    markDirty('Volteo aplicado. Garda para conservar o cambio.');
  }

  function applyCrop() {
    const element = canvas();
    const ctx = context2d();
    if (!(element instanceof HTMLCanvasElement) || !ctx || !cropRect) return;
    const rect = element.getBoundingClientRect();
    const sx = element.width / rect.width;
    const sy = element.height / rect.height;
    const x = Math.max(0, Math.round(cropRect.x * sx));
    const y = Math.max(0, Math.round(cropRect.y * sy));
    const w = Math.min(element.width - x, Math.max(1, Math.round(cropRect.w * sx)));
    const h = Math.min(element.height - y, Math.max(1, Math.round(cropRect.h * sy)));
    const data = ctx.getImageData(x, y, w, h);
    element.width = w;
    element.height = h;
    ctx.putImageData(data, 0, 0);
    resetCrop();
    markDirty('Recorte aplicado. Garda para conservar o cambio.');
  }

  async function restoreOriginal() {
    if (!state.originalDataUrl) return;
    const image = await imageFromUrl(state.originalDataUrl);
    drawImage(image);
    resetCrop();
    state.dirty = false;
    setMessage('Restableceuse a versión que estaba gardada ao abrir o editor.');
  }

  function thumbnailDataUrl() {
    const element = canvas();
    if (!(element instanceof HTMLCanvasElement) || !element.width || !element.height) return '';
    const maxW = 900;
    const maxH = 675;
    const scale = Math.min(1, maxW / element.width, maxH / element.height);
    const thumb = document.createElement('canvas');
    thumb.width = Math.max(1, Math.round(element.width * scale));
    thumb.height = Math.max(1, Math.round(element.height * scale));
    const ctx = thumb.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(element, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL('image/jpeg', 0.78);
  }

  function payloadImaxe() {
    const element = canvas();
    if (!(element instanceof HTMLCanvasElement) || !state.dirty) return null;
    const dataUrl = element.toDataURL('image/jpeg', 0.9);
    const thumb = thumbnailDataUrl();
    return {
      mimeType: 'image/jpeg',
      base64: dataUrl.split(',')[1] || '',
      miniaturaMimeType: 'image/jpeg',
      miniaturaBase64: thumb.split(',')[1] || '',
      thumbDataUrl: thumb
    };
  }

  function applySavedThumbs() {
    for (const [id, src] of savedThumbs.entries()) {
      document.querySelectorAll(`[data-thumb-id="${CSS.escape(id)}"]`).forEach((node) => {
        if (node instanceof HTMLImageElement && node.src !== src) {
          node.src = src;
          node.classList.add('is-ready');
        }
      });
      if (currentId() === id) {
        const dialogImage = document.querySelector('#dialog-image');
        if (dialogImage instanceof HTMLImageElement && !state.active) dialogImage.src = src;
      }
    }
  }

  async function startEditing() {
    const id = currentId();
    if (!id) {
      setMessage('Non se puido identificar a fotografía.', true);
      return;
    }

    const shell = editorShell();
    const normal = document.querySelector('.dialog-image-wrap');
    const trigger = document.querySelector('#open-editor');
    if (!(shell instanceof HTMLElement)) return;

    if (state.active && state.id === id) {
      if (state.dirty && !window.confirm('Saír da edición e descartar os cambios de imaxe que aínda non se gardaron?')) return;
      state.active = false;
      state.dirty = false;
      shell.hidden = true;
      if (normal instanceof HTMLElement) normal.hidden = false;
      if (trigger instanceof HTMLElement) trigger.textContent = 'Editar imaxe';
      resetCrop();
      setMessage('Edición de imaxe pechada.');
      return;
    }

    state.id = id;
    state.active = true;
    state.dirty = false;
    state.originalDataUrl = '';
    shell.hidden = false;
    if (normal instanceof HTMLElement) normal.hidden = true;
    if (trigger instanceof HTMLElement) trigger.textContent = 'Saír da edición';
    setMessage('Cargando o orixinal desde R2…');

    try {
      const response = await fetchBase(`/api/editor-fotos-original?idFoto=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${await waitToken()}` },
        cache: 'no-store'
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.erro || `Erro HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const image = await imageFromUrl(url);
        state.mimeType = blob.type || 'image/jpeg';
        drawImage(image);
        const element = canvas();
        if (element instanceof HTMLCanvasElement) {
          state.originalDataUrl = element.toDataURL('image/jpeg', 0.94);
        }
      } finally {
        URL.revokeObjectURL(url);
      }
      resetCrop();
      setMessage('Editor preparado. Podes xirar, voltear ou recortar e despois usar «Gardar e verificar».');
    } catch (error) {
      state.active = false;
      shell.hidden = true;
      if (normal instanceof HTMLElement) normal.hidden = false;
      if (trigger instanceof HTMLElement) trigger.textContent = 'Editar imaxe';
      setMessage(error instanceof Error ? error.message : 'Non se puido abrir o orixinal.', true);
    }
  }

  function discardEditorSilently() {
    const shell = editorShell();
    const normal = document.querySelector('.dialog-image-wrap');
    const trigger = document.querySelector('#open-editor');
    state.active = false;
    state.dirty = false;
    state.id = '';
    state.originalDataUrl = '';
    if (shell instanceof HTMLElement) shell.hidden = true;
    if (normal instanceof HTMLElement) normal.hidden = false;
    if (trigger instanceof HTMLElement) trigger.textContent = 'Editar imaxe';
    resetCrop();
  }

  function protectClose(event) {
    if (!state.active || !state.dirty) return;
    if (window.confirm('Hai cambios de imaxe sen gardar. Queres pechar e descartalos?')) {
      discardEditorSilently();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function installStyles() {
    if (document.querySelector('#admin-fotos-editor-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-fotos-editor-style';
    style.textContent = `
      #admin-photo-editor[hidden]{display:none!important}
      #admin-photo-editor{display:grid;gap:.75rem}
      .admin-photo-editor-stage{position:relative;display:grid;min-height:470px;place-items:center;overflow:hidden;background:#ddd7d2}
      .admin-photo-editor-stage canvas{display:block;max-width:100%;max-height:68vh;background:#fff;box-shadow:0 6px 22px rgba(40,30,28,.12);touch-action:none}
      .admin-photo-editor-stage.is-cropping canvas{cursor:crosshair}
      .admin-photo-crop-box{position:absolute;border:2px solid #fff;outline:1px solid #5d142b;background:rgba(93,20,43,.14);pointer-events:none}
      .admin-photo-editor-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.45rem}
      .admin-photo-editor-tools button{min-height:2.45rem;padding:.5rem .6rem;border:1px solid #cfc7c1;background:#fff;color:#4b4642;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}
      .admin-photo-editor-tools button:disabled{opacity:.45;cursor:not-allowed}
      .admin-photo-editor-hint{margin:0;color:#756c67;font-size:.72rem;line-height:1.45}
      #open-editor{cursor:pointer}
      @media(max-width:720px){.admin-photo-editor-stage{min-height:300px}.admin-photo-editor-tools{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (instalado) return true;
    const trigger = document.querySelector('#open-editor');
    const normal = document.querySelector('.dialog-image-wrap');
    const imagePanel = document.querySelector('.dialog-image-panel');
    if (!(trigger instanceof HTMLAnchorElement) || !(normal instanceof HTMLElement) || !(imagePanel instanceof HTMLElement)) return false;

    instalado = true;
    installStyles();
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-controls', 'admin-photo-editor');
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      startEditing();
    });

    const actions = imagePanel.querySelector('.image-actions');
    const hint = actions?.querySelector('small');
    if (hint instanceof HTMLElement) hint.textContent = 'O orixinal só se carga desde R2 cando inicias a edición.';

    const shell = document.createElement('section');
    shell.id = 'admin-photo-editor';
    shell.hidden = true;
    shell.innerHTML = `
      <div id="admin-photo-editor-stage" class="admin-photo-editor-stage">
        <canvas id="admin-photo-editor-canvas"></canvas>
        <div id="admin-photo-crop-box" class="admin-photo-crop-box" hidden></div>
      </div>
      <div class="admin-photo-editor-tools" aria-label="Ferramentas de edición da fotografía">
        <button type="button" data-admin-photo-tool="rotate-left">↺ Xirar esquerda</button>
        <button type="button" data-admin-photo-tool="rotate-right">↻ Xirar dereita</button>
        <button type="button" data-admin-photo-tool="flip-x">↔ Voltear horizontal</button>
        <button type="button" data-admin-photo-tool="flip-y">↕ Voltear vertical</button>
        <button type="button" id="admin-photo-start-crop">✂ Seleccionar recorte</button>
        <button type="button" id="admin-photo-apply-crop" disabled>Aplicar recorte</button>
        <button type="button" id="admin-photo-reset">Restablecer versión gardada</button>
      </div>
      <p class="admin-photo-editor-hint">A edición non toca a Sheet nin as galerías ata premer «Gardar e verificar».</p>
    `;
    normal.insertAdjacentElement('afterend', shell);

    shell.querySelectorAll('[data-admin-photo-tool]').forEach((button) => button.addEventListener('click', async () => {
      const tool = button.getAttribute('data-admin-photo-tool');
      if (tool === 'rotate-left') await rotate(-90);
      if (tool === 'rotate-right') await rotate(90);
      if (tool === 'flip-x') await flip('x');
      if (tool === 'flip-y') await flip('y');
    }));

    shell.querySelector('#admin-photo-start-crop')?.addEventListener('click', () => {
      cropMode = true;
      cropRect = null;
      document.querySelector('#admin-photo-editor-stage')?.classList.add('is-cropping');
      setMessage('Arrastra sobre a imaxe para seleccionar o recorte e despois preme «Aplicar recorte».');
    });
    shell.querySelector('#admin-photo-apply-crop')?.addEventListener('click', applyCrop);
    shell.querySelector('#admin-photo-reset')?.addEventListener('click', restoreOriginal);

    const element = canvas();
    element?.addEventListener('pointerdown', (event) => {
      if (!cropMode || !(element instanceof HTMLCanvasElement)) return;
      element.setPointerCapture(event.pointerId);
      cropStart = pointerPosition(event);
      cropRect = { x: cropStart.x, y: cropStart.y, w: 0, h: 0 };
      drawCropBox();
    });
    element?.addEventListener('pointermove', (event) => {
      if (!cropMode || !cropStart) return;
      const point = pointerPosition(event);
      cropRect = {
        x: Math.min(cropStart.x, point.x),
        y: Math.min(cropStart.y, point.y),
        w: Math.abs(point.x - cropStart.x),
        h: Math.abs(point.y - cropStart.y)
      };
      drawCropBox();
    });
    element?.addEventListener('pointerup', () => {
      const apply = document.querySelector('#admin-photo-apply-crop');
      if (apply instanceof HTMLButtonElement) apply.disabled = !cropRect || cropRect.w < 12 || cropRect.h < 12;
    });

    document.querySelector('#dialog-close')?.addEventListener('click', protectClose, true);
    document.querySelector('#cancel-dialog')?.addEventListener('click', protectClose, true);
    document.querySelector('#photo-dialog')?.addEventListener('cancel', protectClose, true);

    const observer = new MutationObserver(() => applySavedThumbs());
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  window.fetch = async (input, init) => {
    const url = urlDe(input);
    const body = bodyJson(init);
    if (body?.idToken) idToken = texto(body.idToken);

    let nextInit = init;
    let editPayload = null;
    let editedId = '';

    if (
      url?.pathname === '/api/xestion-publicacion-foto' &&
      body?.accion === 'gardar' &&
      state.active &&
      state.dirty &&
      texto(body.idFoto) === state.id
    ) {
      editPayload = payloadImaxe();
      if (editPayload?.base64) {
        editedId = state.id;
        nextInit = {
          ...(init || {}),
          body: JSON.stringify({
            ...body,
            mimeType: editPayload.mimeType,
            base64: editPayload.base64,
            miniaturaMimeType: editPayload.miniaturaMimeType,
            miniaturaBase64: editPayload.miniaturaBase64
          })
        };
        setMessage('Gardando a imaxe editada, a miniatura, os datos e os índices R2…');
      }
    }

    const response = await fetchBase(input, nextInit);

    if (editedId && response.ok && editPayload?.thumbDataUrl) {
      savedThumbs.set(editedId, editPayload.thumbDataUrl);
      state.dirty = false;
      state.active = false;
      state.originalDataUrl = '';
      const shell = editorShell();
      const normal = document.querySelector('.dialog-image-wrap');
      const trigger = document.querySelector('#open-editor');
      if (shell instanceof HTMLElement) shell.hidden = true;
      if (normal instanceof HTMLElement) normal.hidden = false;
      if (trigger instanceof HTMLElement) trigger.textContent = 'Editar imaxe';
      resetCrop();
      window.setTimeout(applySavedThumbs, 0);
      window.setTimeout(applySavedThumbs, 120);
      window.setTimeout(applySavedThumbs, 500);
    }

    return response;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
