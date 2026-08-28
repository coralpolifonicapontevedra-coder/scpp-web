(() => {
  'use strict';

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== '/portal/ensaios/estudo') return;

  const ZOOM_MIN = 50;
  const ZOOM_MAX = 200;
  const ZOOM_STEP = 10;
  let zoom = 100;
  let applyingZoom = false;

  const style = document.createElement('style');
  style.textContent = `
    .study-main .now-playing { display: none !important; }
    .study-main .selectors { display: none !important; }
    .study-main .player-card { display: flex; flex-direction: column; }
    .study-compact-line {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(190px, 320px) auto auto;
      gap: .55rem;
      align-items: center;
      min-width: 0;
      padding: .48rem .6rem;
      border-bottom: 1px solid #e7e2de;
      background: #fff;
    }
    .study-compact-title { min-width: 0; }
    .study-compact-title strong {
      display: block;
      overflow: hidden;
      color: #302b28;
      font-size: .9rem;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .study-compact-title small {
      display: block;
      overflow: hidden;
      margin-top: .08rem;
      color: #77706a;
      font-size: .68rem;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .study-compact-audio { min-width: 0; }
    .study-compact-audio > span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .study-compact-audio select {
      width: 100%;
      min-width: 0;
      min-height: 2.08rem !important;
      padding: .28rem .45rem !important;
      border: 1px solid #d4cec8;
      border-radius: 4px;
      background: #fff;
      color: #302c29;
      font: inherit;
      font-size: .78rem !important;
    }
    .study-zoom {
      display: inline-grid;
      grid-template-columns: 2rem 3rem 2rem;
      align-items: center;
      overflow: hidden;
      border: 1px solid #d4cec8;
      border-radius: 4px;
      background: #fff;
    }
    .study-zoom button,
    .study-fullscreen {
      min-height: 2.08rem;
      border: 0;
      background: #fff;
      color: var(--color-principal, #6a1b29);
      font: inherit;
      font-size: .8rem;
      font-weight: 800;
      cursor: pointer;
    }
    .study-zoom button:hover,
    .study-fullscreen:hover { background: #f7eff1; }
    .study-zoom strong {
      color: #4b4541;
      font-size: .68rem;
      text-align: center;
      white-space: nowrap;
    }
    .study-fullscreen {
      min-width: 2.25rem;
      padding: 0 .48rem;
      border: 1px solid #d4cec8;
      border-radius: 4px;
      font-size: 1rem;
      line-height: 1;
    }
    .study-main.from-ensaios .audio-panel {
      grid-template-columns: minmax(120px, .23fr) minmax(260px, 1fr) !important;
      gap: .5rem !important;
      padding: .38rem .55rem !important;
    }
    .study-main.from-ensaios #audio-player { height: 32px !important; }
    .study-main.from-ensaios .score-toolbar {
      padding: .28rem .45rem !important;
      gap: .35rem !important;
    }
    .player-card:fullscreen,
    .player-card:-webkit-full-screen {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: #fff !important;
    }
    .player-card:fullscreen .score-frame,
    .player-card:-webkit-full-screen .score-frame {
      flex: 1 1 auto !important;
      height: auto !important;
      min-height: 0 !important;
    }
    .player-card:fullscreen .study-compact-line,
    .player-card:-webkit-full-screen .study-compact-line {
      flex: 0 0 auto;
    }
    .player-card:fullscreen .audio-panel,
    .player-card:-webkit-full-screen .audio-panel,
    .player-card:fullscreen .score-toolbar,
    .player-card:-webkit-full-screen .score-toolbar {
      flex: 0 0 auto;
    }
    @media (max-width: 760px) {
      .study-main.from-ensaios { padding-top: .35rem !important; }
      .study-main.from-ensaios .study-header { margin-bottom: .35rem !important; }
      .study-compact-line {
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: .35rem;
        padding: .38rem .42rem;
      }
      .study-compact-title {
        grid-column: 1 / -1;
        display: flex;
        gap: .35rem;
        align-items: baseline;
      }
      .study-compact-title strong {
        flex: 1 1 auto;
        font-size: .8rem;
      }
      .study-compact-title small {
        flex: 0 1 auto;
        margin: 0;
        font-size: .63rem;
      }
      .study-compact-audio { min-width: 0; }
      .study-compact-audio select {
        min-height: 1.95rem !important;
        font-size: .72rem !important;
      }
      .study-zoom { grid-template-columns: 1.8rem 2.7rem 1.8rem; }
      .study-zoom button, .study-fullscreen { min-height: 1.95rem; }
      .study-fullscreen { min-width: 2rem; padding: 0 .35rem; }
      .study-main.from-ensaios .audio-panel {
        grid-template-columns: 1fr !important;
        gap: .18rem !important;
        padding: .3rem .4rem !important;
      }
      .study-main.from-ensaios .audio-copy { display: none !important; }
      .study-main.from-ensaios #audio-player { height: 30px !important; }
      .study-main.from-ensaios .score-frame {
        height: calc(100dvh - 165px) !important;
        min-height: 430px !important;
      }
      .player-card:fullscreen .study-compact-title small,
      .player-card:-webkit-full-screen .study-compact-title small { display: none; }
      .player-card:fullscreen .score-frame,
      .player-card:-webkit-full-screen .score-frame {
        height: auto !important;
        min-height: 0 !important;
      }
    }
  `;
  document.head.append(style);

  function setZoomLabel() {
    const label = document.querySelector('#study-zoom-value');
    if (label instanceof HTMLElement) label.textContent = `${zoom}%`;
  }

  function applyZoom() {
    const viewer = document.querySelector('#score-viewer');
    if (!(viewer instanceof HTMLIFrameElement)) return;
    const src = viewer.getAttribute('src') || '';
    if (!src) return;

    const [base, rawHash = ''] = src.split('#');
    const params = new URLSearchParams(rawHash);
    const desired = String(zoom);
    if (params.get('zoom') === desired) return;

    params.set('zoom', desired);
    if (!params.has('toolbar')) params.set('toolbar', '0');
    if (!params.has('navpanes')) params.set('navpanes', '0');

    applyingZoom = true;
    viewer.setAttribute('src', `${base}#${params.toString()}`);
    window.setTimeout(() => { applyingZoom = false; }, 0);
  }

  function changeZoom(delta) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta));
    setZoomLabel();
    applyZoom();
  }

  function syncFullscreenButton() {
    const button = document.querySelector('#study-fullscreen');
    if (!(button instanceof HTMLButtonElement)) return;
    const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    button.textContent = active ? '×' : '⛶';
    button.title = active ? 'Saír de pantalla completa' : 'Pantalla completa';
    button.setAttribute('aria-label', button.title);
  }

  async function toggleFullscreen() {
    const card = document.querySelector('#player-card');
    if (!(card instanceof HTMLElement)) return;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (active) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (card.requestFullscreen) {
        await card.requestFullscreen();
      } else if (card.webkitRequestFullscreen) {
        card.webkitRequestFullscreen();
      }
    } catch (error) {
      console.warn('Non foi posible cambiar o modo de pantalla completa:', error);
    }
  }

  function mirrorWorkInfo() {
    const sourceTitle = document.querySelector('#work-title');
    const sourceMeta = document.querySelector('#work-meta');
    const targetTitle = document.querySelector('#study-compact-work-title');
    const targetMeta = document.querySelector('#study-compact-work-meta');
    if (sourceTitle instanceof HTMLElement && targetTitle instanceof HTMLElement) {
      targetTitle.textContent = sourceTitle.textContent || 'Obra';
    }
    if (sourceMeta instanceof HTMLElement && targetMeta instanceof HTMLElement) {
      targetMeta.textContent = sourceMeta.textContent || '';
    }
  }

  function setup() {
    const playerCard = document.querySelector('#player-card');
    const selectors = document.querySelector('.selectors');
    const audioSelect = document.querySelector('#audio-select');
    const viewer = document.querySelector('#score-viewer');
    if (!(playerCard instanceof HTMLElement) ||
        !(selectors instanceof HTMLElement) ||
        !(audioSelect instanceof HTMLSelectElement) ||
        !(viewer instanceof HTMLIFrameElement)) {
      window.setTimeout(setup, 120);
      return;
    }
    if (document.querySelector('.study-compact-line')) return;

    const main = document.querySelector('.study-main');
    if (main instanceof HTMLElement) main.classList.add('from-ensaios');

    const audioLabel = audioSelect.closest('label');
    const compact = document.createElement('div');
    compact.className = 'study-compact-line';
    compact.innerHTML = `
      <div class="study-compact-title">
        <strong id="study-compact-work-title">Obra</strong>
        <small id="study-compact-work-meta"></small>
      </div>
      <div class="study-compact-audio"></div>
      <div class="study-zoom" aria-label="Zoom da partitura">
        <button id="study-zoom-out" type="button" title="Reducir zoom">−</button>
        <strong id="study-zoom-value">100%</strong>
        <button id="study-zoom-in" type="button" title="Aumentar zoom">+</button>
      </div>
      <button id="study-fullscreen" class="study-fullscreen" type="button" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
    `;

    const audioSlot = compact.querySelector('.study-compact-audio');
    if (audioSlot instanceof HTMLElement && audioLabel instanceof HTMLElement) {
      audioSlot.append(audioLabel);
    }
    playerCard.insertBefore(compact, playerCard.firstChild);
    selectors.hidden = true;

    const sourceTitle = document.querySelector('#work-title');
    const sourceMeta = document.querySelector('#work-meta');
    if (sourceTitle) new MutationObserver(mirrorWorkInfo).observe(sourceTitle, { childList: true, characterData: true, subtree: true });
    if (sourceMeta) new MutationObserver(mirrorWorkInfo).observe(sourceMeta, { childList: true, characterData: true, subtree: true });
    mirrorWorkInfo();

    document.querySelector('#study-zoom-out')?.addEventListener('click', () => changeZoom(-ZOOM_STEP));
    document.querySelector('#study-zoom-in')?.addEventListener('click', () => changeZoom(ZOOM_STEP));
    document.querySelector('#study-fullscreen')?.addEventListener('click', toggleFullscreen);

    new MutationObserver(() => {
      if (applyingZoom) return;
      window.setTimeout(applyZoom, 0);
    }).observe(viewer, { attributes: true, attributeFilter: ['src'] });

    document.addEventListener('fullscreenchange', syncFullscreenButton);
    document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
    setZoomLabel();
    window.setTimeout(applyZoom, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();
