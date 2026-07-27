import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const PATH_CONCERTOS = /^\/portal\/concertos\/?$/;

if (PATH_CONCERTOS.test(window.location.pathname)) {
  const URL_CONCERTOS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSX8BEJ-hrubqEtaZ1zZaLSy7LoxaDQOuQuqR2ior7TZErtBGL5bJG0B_AK5Dp8eFeTDb3Pmpqh7Hnu/pub?gid=1098509641&single=true&output=csv';

  const firebaseConfig = {
    apiKey: 'AIzaSyDrQY7NsaKpBfrSc8GqV3lUQDOIkecPZbs',
    authDomain: 'scpp-portal-privado.firebaseapp.com',
    projectId: 'scpp-portal-privado',
    storageBucket: 'scpp-portal-privado.firebasestorage.app',
    messagingSenderId: '506857659587',
    appId: '1:506857659587:web:a7ed36b22f044f5f639676'
  };

  const auth = getAuth(initializeApp(firebaseConfig));
  const concertos = new Map();
  let concertoActivo = new URLSearchParams(window.location.search).get('id') || '';
  let urlTemporal = '';

  const normalizar = (valor = '') => String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  function parseCSV(texto) {
    const filas = [];
    let fila = [];
    let campo = '';
    let entreComillas = false;

    for (let i = 0; i < texto.length; i += 1) {
      const caracter = texto[i];
      const seguinte = texto[i + 1];

      if (caracter === '"' && entreComillas && seguinte === '"') {
        campo += '"';
        i += 1;
      } else if (caracter === '"') {
        entreComillas = !entreComillas;
      } else if (caracter === ',' && !entreComillas) {
        fila.push(campo);
        campo = '';
      } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
        if (caracter === '\r' && seguinte === '\n') i += 1;
        fila.push(campo);
        if (fila.some((valor) => valor.trim() !== '')) filas.push(fila);
        fila = [];
        campo = '';
      } else {
        campo += caracter;
      }
    }

    if (campo || fila.length) {
      fila.push(campo);
      filas.push(fila);
    }

    const cabeceiras = (filas.shift() || []).map(normalizar);
    return filas.map((valores) => Object.fromEntries(
      cabeceiras.map((cabeceira, indice) => [cabeceira, (valores[indice] || '').trim()])
    ));
  }

  const valor = (fila, ...nomes) => {
    for (const nome of nomes) {
      const resultado = fila[normalizar(nome)];
      if (resultado !== undefined && resultado !== '') return resultado;
    }
    return '';
  };

  function esperarUsuario() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);

    return new Promise((resolve, reject) => {
      let rematado = false;
      const temporizador = window.setTimeout(() => {
        if (rematado) return;
        rematado = true;
        cancelar();
        reject(new Error('A sesión xa non está dispoñible.'));
      }, 8000);

      const cancelar = onAuthStateChanged(auth, (usuario) => {
        if (rematado) return;
        rematado = true;
        window.clearTimeout(temporizador);
        cancelar();
        if (usuario) resolve(usuario);
        else reject(new Error('A sesión xa non está activa.'));
      });
    });
  }

  function nomeDesdeCabecera(cabecera = '') {
    const coincidencia = String(cabecera).match(/filename="?([^";]+)"?/i);
    return coincidencia?.[1] || 'programa-concerto';
  }

  function liberarUrlTemporal() {
    if (!urlTemporal) return;
    URL.revokeObjectURL(urlTemporal);
    urlTemporal = '';
  }

  async function obterDocumento(concertoId) {
    const usuario = await esperarUsuario();
    const idToken = await usuario.getIdToken(true);
    const resposta = await fetch('/api/concertos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        accion: 'obterDocumentoConcerto',
        concertoId
      })
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => null);
      throw new Error(erro?.erro || 'Non foi posible obter o programa de man.');
    }

    return {
      blob: await resposta.blob(),
      nome: nomeDesdeCabecera(resposta.headers.get('Content-Disposition') || '')
    };
  }

  function crearElementos() {
    const dialogoConcerto = document.querySelector('#concert-dialog');
    if (!(dialogoConcerto instanceof HTMLDialogElement) || dialogoConcerto.dataset.mediosPreparados === 'true') return;
    dialogoConcerto.dataset.mediosPreparados = 'true';

    const cartelWrap = dialogoConcerto.querySelector('#detail-poster-wrap');
    if (cartelWrap instanceof HTMLElement) {
      cartelWrap.tabIndex = 0;
      cartelWrap.setAttribute('role', 'button');
      cartelWrap.setAttribute('aria-label', 'Ampliar o cartel do concerto');
      const aviso = document.createElement('figcaption');
      aviso.textContent = 'Preme para ampliar';
      cartelWrap.append(aviso);
    }

    const programaListado = dialogoConcerto.querySelector('.program-section');
    const documentos = document.createElement('section');
    documentos.id = 'concert-documents';
    documentos.className = 'concert-documents';
    documentos.hidden = true;
    documentos.innerHTML = `
      <header>
        <div>
          <span>Documento do concerto</span>
          <strong>Programa de man</strong>
        </div>
        <small id="concert-document-name"></small>
      </header>
      <div class="concert-document-actions">
        <button id="view-concert-document" type="button">Ver programa</button>
        <button id="download-concert-document" type="button">Descargar</button>
      </div>
      <p id="concert-document-message" role="status" aria-live="polite"></p>
    `;
    programaListado?.before(documentos);

    const visor = document.createElement('dialog');
    visor.id = 'concert-media-viewer';
    visor.className = 'concert-media-viewer';
    visor.setAttribute('aria-labelledby', 'concert-media-title');
    visor.innerHTML = `
      <header>
        <h2 id="concert-media-title">Documento do concerto</h2>
        <button type="button" class="concert-media-close" aria-label="Pechar">×</button>
      </header>
      <div class="concert-media-body">
        <img id="concert-media-image" src="" alt="" hidden />
        <iframe id="concert-media-frame" src="" title="Programa de man" hidden></iframe>
      </div>
      <footer>
        <a id="concert-media-download" href="" download>Descargar documento</a>
      </footer>
    `;
    document.body.append(visor);

    const estilo = document.createElement('style');
    estilo.textContent = `
      #concert-dialog .detail-poster-wrap { cursor: zoom-in; }
      #concert-dialog .detail-poster-wrap:focus-visible { outline: 2px solid var(--color-principal); outline-offset: 3px; }
      #concert-dialog .detail-poster-wrap figcaption { margin-top: .4rem; color: var(--color-principal); font-size: .68rem; font-weight: 700; text-align: center; }
      #concert-dialog .concert-documents { margin-top: 1.45rem; padding: 1rem 1.05rem; border: 1px solid #d8d2cc; background: #faf9f7; }
      #concert-dialog .concert-documents > header { display: flex; justify-content: space-between; gap: 1rem; align-items: end; }
      #concert-dialog .concert-documents > header div { display: grid; gap: .18rem; }
      #concert-dialog .concert-documents > header span { color: var(--color-principal); font-size: .68rem; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
      #concert-dialog .concert-documents > header strong { color: #34302d; font-size: .92rem; }
      #concert-dialog .concert-documents > header small { max-width: 48%; overflow: hidden; color: #756f6a; font-size: .68rem; text-overflow: ellipsis; white-space: nowrap; }
      #concert-dialog .concert-document-actions { display: flex; flex-wrap: wrap; gap: .65rem; margin-top: .8rem; }
      #concert-dialog .concert-document-actions button { min-height: 2.45rem; padding: .55rem .9rem; border: 1px solid var(--color-principal); background: #fff; color: var(--color-principal); font: inherit; font-size: .76rem; font-weight: 750; cursor: pointer; }
      #concert-dialog .concert-document-actions button:first-child { background: var(--color-principal); color: #fff; }
      #concert-dialog .concert-document-actions button:disabled { opacity: .55; cursor: wait; }
      #concert-dialog #concert-document-message { min-height: 1.2em; margin: .6rem 0 0; color: #706a65; font-size: .7rem; }
      .concert-media-viewer { width: min(1000px, calc(100vw - 2rem)); max-height: calc(100vh - 2rem); padding: 0; overflow: hidden; border: 0; border-top: 5px solid var(--color-principal); background: #fff; box-shadow: 0 30px 90px rgba(0,0,0,.35); }
      .concert-media-viewer::backdrop { background: rgba(20,18,17,.82); }
      .concert-media-viewer > header { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: .9rem 1rem; border-bottom: 1px solid #ddd8d4; }
      .concert-media-viewer h2 { margin: 0; color: #34302d; font: 700 1rem Aptos,'Segoe UI',Arial,sans-serif; }
      .concert-media-close { width: 2rem; height: 2rem; border: 0; background: transparent; color: var(--color-principal); font-size: 1.8rem; line-height: 1; cursor: pointer; }
      .concert-media-body { display: grid; min-height: min(68vh, 680px); max-height: calc(100vh - 9rem); place-items: center; overflow: auto; background: #f1efed; }
      .concert-media-body img { display: block; max-width: 100%; max-height: calc(100vh - 9rem); object-fit: contain; }
      .concert-media-body iframe { width: 100%; height: min(72vh, 760px); border: 0; background: #fff; }
      .concert-media-viewer > footer { display: flex; justify-content: flex-end; padding: .75rem 1rem; border-top: 1px solid #ddd8d4; }
      .concert-media-viewer > footer a { padding: .55rem .9rem; background: var(--color-principal); color: #fff; font-size: .76rem; font-weight: 750; text-decoration: none; }
      @media (max-width: 620px) {
        #concert-dialog .concert-documents > header { align-items: start; flex-direction: column; }
        #concert-dialog .concert-documents > header small { max-width: 100%; }
        #concert-dialog .concert-document-actions { display: grid; grid-template-columns: 1fr; }
      }
    `;
    document.head.append(estilo);

    const pecharVisor = visor.querySelector('.concert-media-close');
    pecharVisor?.addEventListener('click', () => visor.close());
    visor.addEventListener('click', (evento) => {
      if (evento.target === visor) visor.close();
    });
    visor.addEventListener('close', () => {
      const imaxe = visor.querySelector('#concert-media-image');
      const frame = visor.querySelector('#concert-media-frame');
      if (imaxe instanceof HTMLImageElement) imaxe.src = '';
      if (frame instanceof HTMLIFrameElement) frame.src = '';
      liberarUrlTemporal();
    });

    const ampliarCartel = () => {
      const cartel = dialogoConcerto.querySelector('#detail-poster');
      if (!(cartel instanceof HTMLImageElement) || !cartel.src || cartelWrap?.hidden) return;
      liberarUrlTemporal();
      const imaxe = visor.querySelector('#concert-media-image');
      const frame = visor.querySelector('#concert-media-frame');
      const descarga = visor.querySelector('#concert-media-download');
      const titulo = visor.querySelector('#concert-media-title');
      if (titulo instanceof HTMLElement) titulo.textContent = cartel.alt || 'Cartel do concerto';
      if (imaxe instanceof HTMLImageElement) {
        imaxe.src = cartel.src;
        imaxe.alt = cartel.alt || 'Cartel ampliado';
        imaxe.hidden = false;
      }
      if (frame instanceof HTMLIFrameElement) frame.hidden = true;
      if (descarga instanceof HTMLAnchorElement) descarga.hidden = true;
      visor.showModal();
    };

    cartelWrap?.addEventListener('click', ampliarCartel);
    cartelWrap?.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        ampliarCartel();
      }
    });

    const ver = documentos.querySelector('#view-concert-document');
    const descargar = documentos.querySelector('#download-concert-document');

    ver?.addEventListener('click', async () => {
      if (!(ver instanceof HTMLButtonElement) || !concertoActivo) return;
      const mensaxe = documentos.querySelector('#concert-document-message');
      const textoAnterior = ver.textContent;
      ver.disabled = true;
      ver.textContent = 'Abrindo…';
      if (mensaxe instanceof HTMLElement) mensaxe.textContent = '';

      try {
        const ficheiro = await obterDocumento(concertoActivo);
        liberarUrlTemporal();
        urlTemporal = URL.createObjectURL(ficheiro.blob);
        const imaxe = visor.querySelector('#concert-media-image');
        const frame = visor.querySelector('#concert-media-frame');
        const descargaVisor = visor.querySelector('#concert-media-download');
        const titulo = visor.querySelector('#concert-media-title');
        const eImaxe = ficheiro.blob.type.startsWith('image/');

        if (titulo instanceof HTMLElement) titulo.textContent = 'Programa de man';
        if (imaxe instanceof HTMLImageElement) {
          imaxe.src = eImaxe ? urlTemporal : '';
          imaxe.alt = eImaxe ? 'Programa de man do concerto' : '';
          imaxe.hidden = !eImaxe;
        }
        if (frame instanceof HTMLIFrameElement) {
          frame.src = eImaxe ? '' : urlTemporal;
          frame.hidden = eImaxe;
        }
        if (descargaVisor instanceof HTMLAnchorElement) {
          descargaVisor.href = urlTemporal;
          descargaVisor.download = ficheiro.nome;
          descargaVisor.hidden = false;
        }
        visor.showModal();
      } catch (erro) {
        if (mensaxe instanceof HTMLElement) {
          mensaxe.textContent = erro instanceof Error ? erro.message : 'Non foi posible abrir o programa.';
        }
      } finally {
        ver.disabled = false;
        ver.textContent = textoAnterior || 'Ver programa';
      }
    });

    descargar?.addEventListener('click', async () => {
      if (!(descargar instanceof HTMLButtonElement) || !concertoActivo) return;
      const mensaxe = documentos.querySelector('#concert-document-message');
      const textoAnterior = descargar.textContent;
      descargar.disabled = true;
      descargar.textContent = 'Preparando…';
      if (mensaxe instanceof HTMLElement) mensaxe.textContent = '';

      try {
        const ficheiro = await obterDocumento(concertoActivo);
        const url = URL.createObjectURL(ficheiro.blob);
        const ligazon = document.createElement('a');
        ligazon.href = url;
        ligazon.download = ficheiro.nome;
        document.body.append(ligazon);
        ligazon.click();
        ligazon.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (erro) {
        if (mensaxe instanceof HTMLElement) {
          mensaxe.textContent = erro instanceof Error ? erro.message : 'Non foi posible descargar o programa.';
        }
      } finally {
        descargar.disabled = false;
        descargar.textContent = textoAnterior || 'Descargar';
      }
    });

    const observador = new MutationObserver(() => {
      if (dialogoConcerto.open) actualizarDocumentos();
    });
    observador.observe(dialogoConcerto, { attributes: true, attributeFilter: ['open'] });
  }

  function actualizarDocumentos() {
    const seccion = document.querySelector('#concert-documents');
    if (!(seccion instanceof HTMLElement)) return;
    const concerto = concertos.get(concertoActivo);
    const ruta = concerto?.triptico || '';
    seccion.hidden = !ruta;
    const nome = seccion.querySelector('#concert-document-name');
    const mensaxe = seccion.querySelector('#concert-document-message');
    if (nome instanceof HTMLElement) {
      nome.textContent = ruta.split('/').filter(Boolean).pop() || '';
    }
    if (mensaxe instanceof HTMLElement) mensaxe.textContent = '';
  }

  async function cargarConcertos() {
    const resposta = await fetch(URL_CONCERTOS, { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`Erro ${resposta.status}`);
    const filas = parseCSV(await resposta.text());
    filas.forEach((fila) => {
      const id = valor(fila, 'Id', 'Row ID');
      if (!id) return;
      concertos.set(id, {
        triptico: valor(fila, 'Triptico', 'Tríptico')
      });
    });
    actualizarDocumentos();
  }

  function iniciar() {
    crearElementos();

    document.addEventListener('click', (evento) => {
      const destino = evento.target;
      if (!(destino instanceof Element)) return;
      const tarxeta = destino.closest('#concert-grid button[data-id]');
      if (!(tarxeta instanceof HTMLButtonElement)) return;
      concertoActivo = tarxeta.dataset.id || '';
      window.setTimeout(actualizarDocumentos, 0);
    }, true);

    cargarConcertos().catch((erro) => console.error('Non se puideron preparar os documentos dos concertos:', erro));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
}
