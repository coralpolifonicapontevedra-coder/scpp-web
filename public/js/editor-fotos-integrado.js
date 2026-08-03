(() => {
  let idToken = '';
  let fotos = [];
  let preparada = false;
  const fetchOriginal = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      if ((url.includes('/api/fotos') || url.includes('/api/editor-fotos')) && typeof init.body === 'string') {
        const body = JSON.parse(init.body);
        if (body.idToken) idToken = String(body.idToken);
        const response = await fetchOriginal(input, init);
        if (url.includes('/api/fotos') && body.accion === 'listarFotosRevision') {
          response.clone().json().then((data) => {
            if (data?.ok && Array.isArray(data.fotos)) {
              fotos = data.fotos;
              actualizarCampos();
            }
          }).catch(() => {});
        }
        return response;
      }
    } catch {}
    return fetchOriginal(input, init);
  };

  const texto = (v = '') => String(v ?? '').trim();

  function fotoActual() {
    const select = document.querySelector('#photo-select');
    if (!(select instanceof HTMLSelectElement)) return null;
    return fotos.find((f) => texto(f.rowId || f.idFoto) === select.value) || null;
  }

  function valorBooleano(valor) {
    return valor === true || ['true', 'si', 'sí', 'yes', '1'].includes(texto(valor).toLowerCase());
  }

  function crearPanel() {
    if (preparada) return;
    const tools = document.querySelector('.tools-panel');
    const resultado = tools?.querySelector('section:last-of-type');
    if (!(tools instanceof HTMLElement) || !(resultado instanceof HTMLElement)) return;

    const panel = document.createElement('section');
    panel.className = 'publication-editor-panel';
    panel.innerHTML = `
      <h2>Revisión e publicación</h2>
      <div class="editor-fields">
        <label class="editor-field">
          <span>Título</span>
          <input id="edit-title" type="text" maxlength="120">
        </label>
        <label class="editor-field">
          <span>Pé de foto</span>
          <textarea id="edit-caption" rows="3" maxlength="600"></textarea>
        </label>
        <label class="editor-field">
          <span>Observacións privadas</span>
          <textarea id="edit-notes" rows="2" maxlength="500"></textarea>
        </label>
      </div>
      <fieldset class="editor-destinations">
        <legend>Destino da publicación</legend>
        <label class="destination-row">
          <input id="edit-public" type="checkbox">
          <span><strong>Galería pública</strong><small>Visible para calquera visitante</small></span>
        </label>
        <label class="featured-row">
          <input id="edit-public-featured" type="checkbox" disabled>
          <span>Destacar na galería pública</span>
        </label>
        <label class="destination-row">
          <input id="edit-private" type="checkbox">
          <span><strong>Galería privada</strong><small>Visible para as persoas autorizadas</small></span>
        </label>
        <label class="featured-row">
          <input id="edit-private-featured" type="checkbox" disabled>
          <span>Destacar na galería privada</span>
        </label>
      </fieldset>`;
    tools.insertBefore(panel, resultado);

    const publish = document.createElement('button');
    publish.id = 'publish-photo';
    publish.className = 'primary publish-edited-photo';
    publish.type = 'button';
    publish.textContent = 'Publicar edición';
    resultado.querySelector('.tool-grid')?.appendChild(publish);

    const save = document.querySelector('#save-photo');
    if (save instanceof HTMLButtonElement) save.textContent = 'Gardar borrador';

    const publicBox = document.querySelector('#edit-public');
    const privateBox = document.querySelector('#edit-private');
    publicBox?.addEventListener('change', () => {
      const featured = document.querySelector('#edit-public-featured');
      if (featured instanceof HTMLInputElement && publicBox instanceof HTMLInputElement) {
        featured.disabled = !publicBox.checked;
        if (!publicBox.checked) featured.checked = false;
      }
    });
    privateBox?.addEventListener('change', () => {
      const featured = document.querySelector('#edit-private-featured');
      if (featured instanceof HTMLInputElement && privateBox instanceof HTMLInputElement) {
        featured.disabled = !privateBox.checked;
        if (!privateBox.checked) featured.checked = false;
      }
    });

    document.querySelector('#photo-select')?.addEventListener('change', () => setTimeout(actualizarCampos, 0));
    preparada = true;
    actualizarCampos();
  }

  function actualizarCampos() {
    if (!preparada) return;
    const foto = fotoActual();
    if (!foto) return;
    const title = document.querySelector('#edit-title');
    const caption = document.querySelector('#edit-caption');
    const notes = document.querySelector('#edit-notes');
    const publicBox = document.querySelector('#edit-public');
    const privateBox = document.querySelector('#edit-private');
    const publicFeatured = document.querySelector('#edit-public-featured');
    const privateFeatured = document.querySelector('#edit-private-featured');

    if (title instanceof HTMLInputElement) title.value = texto(foto.titulo);
    if (caption instanceof HTMLTextAreaElement) caption.value = texto(foto.peFoto);
    if (notes instanceof HTMLTextAreaElement) notes.value = texto(foto.observacions);
    if (publicBox instanceof HTMLInputElement) publicBox.checked = valorBooleano(foto.publicarPublica);
    if (privateBox instanceof HTMLInputElement) privateBox.checked = valorBooleano(foto.publicarPrivada);
    if (publicFeatured instanceof HTMLInputElement) {
      publicFeatured.checked = valorBooleano(foto.destacadaPublica);
      publicFeatured.disabled = !(publicBox instanceof HTMLInputElement && publicBox.checked);
    }
    if (privateFeatured instanceof HTMLInputElement) {
      privateFeatured.checked = valorBooleano(foto.destacadaPrivada);
      privateFeatured.disabled = !(privateBox instanceof HTMLInputElement && privateBox.checked);
    }
  }

  function mensaxe(value, error = false) {
    const node = document.querySelector('#editor-message');
    if (!(node instanceof HTMLElement)) return;
    node.textContent = value;
    node.dataset.error = error ? 'true' : 'false';
  }

  async function chamarEditor(body) {
    if (!idToken) throw new Error('A sesión aínda non está preparada.');
    const response = await fetchOriginal('/api/editor-fotos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, ...body })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.erro || `HTTP ${response.status}`);
    return result;
  }

  function datosFormulario() {
    const read = (selector) => {
      const node = document.querySelector(selector);
      return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node.value : '';
    };
    const checked = (selector) => {
      const node = document.querySelector(selector);
      return node instanceof HTMLInputElement && node.checked;
    };
    return {
      titulo: read('#edit-title'),
      peFoto: read('#edit-caption'),
      observacions: read('#edit-notes'),
      publicarPublica: checked('#edit-public'),
      publicarPrivada: checked('#edit-private'),
      destacadaPublica: checked('#edit-public-featured'),
      destacadaPrivada: checked('#edit-private-featured')
    };
  }

  async function gardar(modo) {
    const canvas = document.querySelector('#editor-canvas');
    const select = document.querySelector('#photo-select');
    if (!(canvas instanceof HTMLCanvasElement) || !(select instanceof HTMLSelectElement) || !select.value) return;

    const campos = datosFormulario();
    if (modo === 'publicar' && !campos.publicarPublica && !campos.publicarPrivada) {
      mensaxe('Selecciona a galería pública, a privada ou ambas antes de publicar.', true);
      return;
    }

    const save = document.querySelector('#save-photo');
    const publish = document.querySelector('#publish-photo');
    if (save instanceof HTMLButtonElement) save.disabled = true;
    if (publish instanceof HTMLButtonElement) publish.disabled = true;
    mensaxe(modo === 'publicar' ? 'Gardando a edición en R2…' : 'Gardando o borrador en R2…');

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const result = await chamarEditor({
        accion: 'gardarEdicion',
        modo,
        idFoto: select.value,
        mimeType: 'image/jpeg',
        base64: dataUrl.split(',')[1] || '',
        ...campos
      });
      mensaxe(result.mensaxe || 'Edición gardada.');
      if (modo === 'publicar') comprobarEstado(select.value);
    } catch (error) {
      mensaxe(error instanceof Error ? error.message : 'Non se puido gardar a edición.', true);
    } finally {
      if (save instanceof HTMLButtonElement) save.disabled = false;
      if (publish instanceof HTMLButtonElement) publish.disabled = false;
    }
  }

  async function comprobarEstado(idFoto) {
    for (let intento = 0; intento < 20; intento += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const result = await chamarEditor({ accion: 'estadoEdicion', idFoto });
        if (result.estado === 'sincronizada') {
          mensaxe(result.mensaxe || 'Publicación sincronizada correctamente.');
          return;
        }
        if (result.estado === 'erro') {
          mensaxe(`A edición está gardada en R2, pero a sincronización fallou: ${result.erro || 'erro descoñecido'}`, true);
          return;
        }
        mensaxe('A edición está en R2. Sincronizando a publicación…');
      } catch {
        return;
      }
    }
    mensaxe('A edición está gardada en R2. A sincronización continúa en segundo plano.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    crearPanel();
    setTimeout(crearPanel, 800);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#save-photo')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      gardar('borrador');
    }
    if (target.closest('#publish-photo')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      gardar('publicar');
    }
  }, true);
})();