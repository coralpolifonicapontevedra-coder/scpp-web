import { portalRequest } from './portal-session.js';

const ROUTE = '/portal/administracion/repertorio/';
const AFTER_CREATE_KEY = 'scpp-repertorio-admin-after-create-v1';
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

const clean = (value) => String(value ?? '').trim();
const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char] || char));

function eRutaRepertorio() {
  const path = `${window.location.pathname.replace(/\/+$/, '')}/`;
  return path === ROUTE;
}

function dataLocalHoxe() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function ficheiroABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Non foi posible ler o ficheiro de audio.'));
    reader.readAsDataURL(file);
  });
}

function tabActiva() {
  return document.querySelector('[data-tab].active')?.getAttribute('data-tab') || 'obras';
}

function inxectarInterface() {
  if (document.querySelector('#new-obra-admin-dialog')) return;

  const style = document.createElement('style');
  style.textContent = `
    .scpp-rep-create-dialog{width:min(780px,calc(100vw - 2rem));max-height:90vh;overflow:auto;border:1px solid #d8d0ca;border-radius:6px;padding:0;background:#fff;box-shadow:0 26px 80px rgb(0 0 0 / 22%)}
    .scpp-rep-create-dialog::backdrop{background:rgb(0 0 0 / 35%)}
    .scpp-rep-create-dialog form{display:grid;gap:0;margin:0;padding:0}
    .scpp-rep-create-dialog form>header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:1.2rem 1.3rem;border-bottom:1px solid #e6dfda;background:#fff}
    .scpp-rep-create-dialog .scpp-kicker{display:block;color:#806f74;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
    .scpp-rep-create-dialog h2{margin:.2rem 0 0;color:#5d142b;font-size:1.55rem}
    .scpp-rep-create-dialog .scpp-close{border:0;background:transparent;padding:.1rem .35rem;font-size:1.5rem;line-height:1;cursor:pointer}
    .scpp-rep-create-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem 1.1rem;padding:1.25rem 1.3rem;background:#fbfaf9}
    .scpp-rep-create-fields label{display:grid;align-content:start;gap:.4rem;min-width:0}
    .scpp-rep-create-fields label.wide{grid-column:1/-1}
    .scpp-rep-create-fields label>span{color:#5d534e;font-size:.74rem;font-weight:800}
    .scpp-rep-create-fields input,.scpp-rep-create-fields select,.scpp-rep-create-fields textarea{box-sizing:border-box;width:100%;min-height:2.7rem;border:1px solid #cfc8c3;border-radius:3px;background:#fff;padding:.72rem .78rem;color:#272321;font:inherit}
    .scpp-rep-create-fields textarea{min-height:6rem;resize:vertical}
    .scpp-rep-create-dialog .scpp-note,.scpp-rep-create-dialog .scpp-status{margin:0;padding:.75rem 1.3rem 0;color:#746b66;font-size:.82rem}
    .scpp-rep-create-dialog .scpp-status{min-height:1.2rem;font-weight:700}
    .scpp-rep-create-dialog form>footer{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1rem;padding:1rem 1.3rem;border-top:1px solid #e6dfda;background:#fff}
    .scpp-rep-create-dialog button{border:1px solid #c9c1bc;background:#fff;padding:.7rem 1rem;font:inherit;font-weight:800;cursor:pointer}
    .scpp-rep-create-dialog button.primary{border-color:#5d142b;background:#5d142b;color:#fff}
    .scpp-rep-create-dialog button:disabled{cursor:wait;opacity:.6}
    @media(max-width:700px){.scpp-rep-create-fields{grid-template-columns:1fr}.scpp-rep-create-fields label.wide{grid-column:auto}.scpp-rep-create-dialog{width:calc(100vw - 1rem)}}
  `;
  document.head.append(style);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <dialog id="new-obra-admin-dialog" class="scpp-rep-create-dialog">
      <form id="new-obra-admin-form">
        <header><div><span class="scpp-kicker">Alta</span><h2>Nova obra</h2></div><button class="scpp-close" type="button" data-scpp-close aria-label="Pechar">×</button></header>
        <div class="scpp-rep-create-fields">
          <label><span>Nome da obra *</span><input name="NomeObra" required></label>
          <label><span>Compositor</span><input name="Compositor"></label>
          <label><span>Autor da letra</span><input name="AutorLetra"></label>
          <label><span>Nacemento / falecemento</span><input name="Nac/fall"></label>
          <label><span>Categoría</span><select name="Categoria"><option value="">Selecciona unha categoría…</option><option>Cantos de Nadal</option><option>Música sacra</option><option>Música do Renacemento</option><option>Música galega</option><option>Música surtida</option><option>Outra</option></select></label>
          <label><span>Colección</span><input name="Coleccion"></label>
          <label><span>Orde na colección</span><input name="OrdeColeccion" type="number"></label>
          <label><span>Partitura de referencia</span><input name="Partitura"></label>
          <label><span>Vídeo</span><input name="Vídeo"></label>
          <label><span>Ligazón ao vídeo</span><input name="Enlace a vídeo" type="url"></label>
          <label class="wide"><span>Comentarios</span><textarea name="Comentarios" rows="4"></textarea></label>
        </div>
        <p class="scpp-note">O identificador e o Row ID créanse automaticamente na folla Repertorio.</p>
        <p id="new-obra-admin-status" class="scpp-status"></p>
        <footer><button type="button" data-scpp-close>Cancelar</button><button class="primary" type="submit">Gardar obra</button></footer>
      </form>
    </dialog>

    <dialog id="new-audio-admin-dialog" class="scpp-rep-create-dialog">
      <form id="new-audio-admin-form">
        <header><div><span class="scpp-kicker">Alta</span><h2>Novo audio</h2></div><button class="scpp-close" type="button" data-scpp-close aria-label="Pechar">×</button></header>
        <div class="scpp-rep-create-fields">
          <label><span>Obra relacionada *</span><select id="new-audio-admin-obra" name="NomeObra" required><option value="">Cargando obras…</option></select></label>
          <label><span>Voz</span><input name="Voz" list="new-audio-admin-voices" placeholder="Soprano, Contralto, Tenor…"><datalist id="new-audio-admin-voices"></datalist></label>
          <label><span>Tipo de audio</span><input name="TipoAudio" list="new-audio-admin-types" value="Estudo"><datalist id="new-audio-admin-types"></datalist></label>
          <label><span>Data de carga</span><input name="DataCarga" type="date"></label>
          <label><span>Orde</span><input name="Orde" type="number" min="0"></label>
          <label class="wide"><span>Observacións</span><textarea name="Observacións" rows="4"></textarea></label>
          <label class="wide"><span>Ficheiro de audio *</span><input name="ficheiro" type="file" accept="audio/*,video/mp4,.mp3,.m4a,.mp4,.wav,.ogg,.aac,.flac" required></label>
        </div>
        <p class="scpp-note">O ficheiro gardarase en R2 privado e o rexistro crearase en AudiosRepertorio cos metadatos técnicos correspondentes.</p>
        <p id="new-audio-admin-status" class="scpp-status"></p>
        <footer><button type="button" data-scpp-close>Cancelar</button><button class="primary" type="submit">Gardar audio</button></footer>
      </form>
    </dialog>
  `;

  document.body.append(...wrapper.children);
  document.querySelectorAll('.scpp-rep-create-dialog [data-scpp-close]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });

  document.querySelector('#new-obra-admin-form')?.addEventListener('submit', gardarObra);
  document.querySelector('#new-audio-admin-form')?.addEventListener('submit', gardarAudio);
}

async function catalogoAdministracion() {
  return portalRequest('/api/repertorio-admin', 'listarRepertorioAdministracion');
}

function valoresUnicos(rows, key, defaults = []) {
  return [...new Set([...defaults, ...rows.map((row) => clean(row?.[key])).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, 'gl', { sensitivity: 'base' }));
}

async function abrirObra() {
  const form = document.querySelector('#new-obra-admin-form');
  const status = document.querySelector('#new-obra-admin-status');
  form?.reset();
  if (status) status.textContent = '';
  document.querySelector('#new-obra-admin-dialog')?.showModal();
}

async function abrirAudio() {
  const form = document.querySelector('#new-audio-admin-form');
  const status = document.querySelector('#new-audio-admin-status');
  if (!form) return;
  form.reset();
  if (status) status.textContent = 'Cargando catálogo…';
  const date = form.elements.namedItem('DataCarga');
  if (date) date.value = dataLocalHoxe();
  document.querySelector('#new-audio-admin-dialog')?.showModal();

  try {
    const catalogo = await catalogoAdministracion();
    const obras = Array.isArray(catalogo.obras) ? catalogo.obras : [];
    const audios = Array.isArray(catalogo.audios) ? catalogo.audios : [];
    const select = document.querySelector('#new-audio-admin-obra');
    if (select) {
      select.innerHTML = '<option value="">Selecciona unha obra…</option>' + obras
        .slice()
        .sort((a, b) => clean(a.NomeObra).localeCompare(clean(b.NomeObra), 'gl', { sensitivity: 'base' }))
        .map((obra) => `<option value="${esc(obra.Id)}">${esc(obra.NomeObra)}</option>`)
        .join('');
    }
    const voces = valoresUnicos(audios, 'Voz', ['Audioxeral', 'Xeral', 'Soprano', 'Contralto', 'Tenor', 'Baixo', 'Homes', 'Mulleres']);
    const tipos = valoresUnicos(audios, 'TipoAudio', ['Estudo', 'Referencia', 'Interpretación', 'Ensaio', 'Histórico', 'Outro']);
    const voicesList = document.querySelector('#new-audio-admin-voices');
    const typesList = document.querySelector('#new-audio-admin-types');
    if (voicesList) voicesList.innerHTML = voces.map((value) => `<option value="${esc(value)}"></option>`).join('');
    if (typesList) typesList.innerHTML = tipos.map((value) => `<option value="${esc(value)}"></option>`).join('');
    if (status) status.textContent = '';
  } catch (error) {
    if (status) status.textContent = `⚠ ${error instanceof Error ? error.message : String(error)}`;
  }
}

function lembrarAlta(tab, id) {
  try {
    window.sessionStorage.setItem(AFTER_CREATE_KEY, JSON.stringify({ tab, id: clean(id) }));
  } catch {}
  window.location.reload();
}

async function gardarObra(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#new-obra-admin-status');
  const button = form.querySelector('button[type="submit"]');
  const fd = new FormData(form);
  const obra = Object.fromEntries([...fd.entries()].map(([key, value]) => [key, clean(value)]));
  if (!obra.NomeObra) {
    if (status) status.textContent = '⚠ Indica o nome da obra.';
    return;
  }

  try {
    button.disabled = true;
    if (status) status.textContent = 'Gardando a obra…';
    const result = await portalRequest('/api/repertorio-admin-altas', 'altaObraRepertorioAdministracion', { obra });
    if (status) status.textContent = '✓ Obra creada correctamente.';
    setTimeout(() => lembrarAlta('obras', result.id), 350);
  } catch (error) {
    if (status) status.textContent = `⚠ ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
}

async function gardarAudio(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#new-audio-admin-status');
  const button = form.querySelector('button[type="submit"]');
  const fd = new FormData(form);
  const file = fd.get('ficheiro');

  if (!(file instanceof File) || !file.size) {
    if (status) status.textContent = '⚠ Selecciona un ficheiro de audio.';
    return;
  }
  if (file.size > MAX_AUDIO_BYTES) {
    if (status) status.textContent = '⚠ O ficheiro supera o límite de 40 MB.';
    return;
  }

  const audio = {
    NomeObra: clean(fd.get('NomeObra')),
    Voz: clean(fd.get('Voz')),
    TipoAudio: clean(fd.get('TipoAudio')) || 'Estudo',
    DataCarga: clean(fd.get('DataCarga')) || dataLocalHoxe(),
    Orde: clean(fd.get('Orde')),
    'Observacións': clean(fd.get('Observacións'))
  };
  if (!audio.NomeObra) {
    if (status) status.textContent = '⚠ Selecciona a obra relacionada.';
    return;
  }

  try {
    button.disabled = true;
    if (status) status.textContent = 'Subindo o ficheiro a R2 e creando o rexistro…';
    const result = await portalRequest('/api/repertorio-admin-altas', 'altaAudioRepertorioAdministracion', {
      audio,
      ficheiro: {
        nome: file.name,
        mimeType: file.type || '',
        base64: await ficheiroABase64(file)
      }
    });
    if (status) status.textContent = '✓ Audio creado e verificado correctamente.';
    setTimeout(() => lembrarAlta('audios', result.id), 350);
  } catch (error) {
    if (status) status.textContent = `⚠ ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
}

async function restaurarAlta() {
  let pending = null;
  try {
    pending = JSON.parse(window.sessionStorage.getItem(AFTER_CREATE_KEY) || 'null');
    if (pending) window.sessionStorage.removeItem(AFTER_CREATE_KEY);
  } catch {}
  if (!pending?.tab) return;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const app = document.querySelector('#app');
    if (app && !app.hidden) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const tabButton = document.querySelector(`[data-tab="${pending.tab}"]`);
  tabButton?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const select = document.querySelector('#record-select');
  if (select && pending.id && [...select.options].some((option) => option.value === pending.id)) {
    select.value = pending.id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function iniciar() {
  if (!eRutaRepertorio()) return;
  inxectarInterface();

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('#new') : null;
    if (!target) return;
    const tab = tabActiva();
    if (tab === 'partituras') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (tab === 'obras') abrirObra();
    if (tab === 'audios') abrirAudio();
  }, true);

  restaurarAlta();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
}