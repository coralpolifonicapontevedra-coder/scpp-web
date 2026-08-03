(() => {
  'use strict';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function urlFoto(foto = {}) {
    const directa = String(foto.urlPublica || '').trim();
    if (directa) return directa;
    const ruta = String(
      foto.rutaR2Publica ||
      foto.rutaR2_Publica ||
      foto.RutaR2_Publica ||
      foto.rutaR2 ||
      ''
    ).trim();
    return ruta
      ? `/arquivos/publico/${ruta.split('/').map(encodeURIComponent).join('/')}`
      : '';
  }

  async function lerJsonRobusto(response) {
    const texto = (await response.text()).replace(/^\uFEFF/, '').trim();
    try {
      return JSON.parse(texto);
    } catch {
      const inicio = texto.indexOf('{');
      const fin = texto.lastIndexOf('}');
      if (inicio >= 0 && fin > inicio) return JSON.parse(texto.slice(inicio, fin + 1));
      throw new Error('A resposta da galería non contén JSON válido.');
    }
  }

  function abrirDialogo(ruta, titulo) {
    const dialog = document.querySelector('#gallery-dialog');
    const image = document.querySelector('#dialog-image');
    const caption = document.querySelector('#dialog-title');
    if (!(dialog instanceof HTMLDialogElement) || !(image instanceof HTMLImageElement)) return;
    image.src = ruta;
    image.alt = titulo;
    if (caption) caption.textContent = titulo;
    dialog.showModal();
  }

  function crearTarxeta(foto) {
    const ruta = urlFoto(foto);
    if (!ruta) return null;

    const titulo = String(foto.titulo || 'Fotografía da SCPP').trim();
    const categoria = String(foto.categoria || foto.categoriaPublica || 'Outros').trim() || 'Outros';
    const ano = String(foto.ano || foto.anoAproximado || '').trim();

    const article = document.createElement('article');
    article.className = 'gallery-card';
    article.dataset.category = categoria;
    article.dataset.idFoto = String(foto.idFoto || foto.rowId || '').trim();

    const button = document.createElement('button');
    button.className = 'gallery-image-button';
    button.type = 'button';
    button.setAttribute('aria-label', `Ampliar ${titulo}`);

    const image = document.createElement('img');
    image.src = ruta;
    image.alt = titulo;
    image.loading = 'lazy';
    image.decoding = 'async';

    const zoom = document.createElement('span');
    zoom.className = 'zoom-hint';
    zoom.setAttribute('aria-hidden', 'true');
    zoom.textContent = 'Ampliar';
    button.append(image, zoom);
    button.addEventListener('click', () => abrirDialogo(ruta, titulo));

    const content = document.createElement('div');
    content.className = 'gallery-content-box';
    const meta = document.createElement('div');
    meta.className = 'gallery-meta';
    const cat = document.createElement('span');
    cat.className = 'gallery-category';
    cat.textContent = categoria;
    meta.append(cat);
    if (ano) {
      const time = document.createElement('time');
      time.textContent = ano;
      meta.append(time);
    }
    const heading = document.createElement('h2');
    heading.textContent = titulo;
    content.append(meta, heading);
    article.append(button, content);
    return article;
  }

  function actualizarEstado(total) {
    const count = document.querySelector('#gallery-count');
    const status = document.querySelector('#gallery-status');
    const empty = document.querySelector('#gallery-empty');
    if (count) count.textContent = `${total} fotografía${total === 1 ? '' : 's'}`;
    if (status) status.textContent = '';
    if (empty instanceof HTMLElement) empty.hidden = total > 0;
  }

  async function recuperar() {
    const grid = document.querySelector('#gallery-grid');
    if (!(grid instanceof HTMLElement)) return;

    await sleep(700);
    if (grid.querySelector('.gallery-card')) return;

    let ultimoErro;
    for (let intento = 0; intento < 2; intento += 1) {
      try {
        const response = await fetch(`/api/galeria?recovery=${Date.now()}-${intento}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        const datos = await lerJsonRobusto(response);
        if (!response.ok || datos?.ok !== true || !Array.isArray(datos.fotos)) {
          throw new Error(datos?.erro || `Erro HTTP ${response.status}`);
        }

        const tarxetas = datos.fotos.map(crearTarxeta).filter(Boolean);
        grid.replaceChildren(...tarxetas);
        actualizarEstado(tarxetas.length);
        return;
      } catch (erro) {
        ultimoErro = erro;
        await sleep(500);
      }
    }

    const status = document.querySelector('#gallery-status');
    if (status) {
      status.textContent = `Non foi posible cargar a galería: ${ultimoErro instanceof Error ? ultimoErro.message : 'erro descoñecido'}`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', recuperar, { once: true });
  } else {
    recuperar();
  }
})();
