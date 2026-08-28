(() => {
  'use strict';

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== '/portal/ensaios/estudo') return;

  const rows = new Map();
  let panel = null;
  let list = null;

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('aside');
    panel.id = 'study-pdf-debug';
    panel.setAttribute('aria-label', 'Diagnóstico do visor PDF');
    panel.style.cssText = [
      'position:fixed',
      'left:.45rem',
      'right:.45rem',
      'bottom:.45rem',
      'z-index:2147483647',
      'max-height:42vh',
      'overflow:auto',
      'padding:.55rem .65rem',
      'border:1px solid #8b6f74',
      'border-radius:6px',
      'background:rgba(255,255,255,.97)',
      'box-shadow:0 4px 18px rgba(0,0,0,.18)',
      'font:12px/1.35 system-ui,sans-serif',
      'color:#2f2927'
    ].join(';');

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;gap:.5rem;align-items:center;margin-bottom:.35rem';
    const title = document.createElement('strong');
    title.textContent = 'Diagnóstico PDF · Preview';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Ocultar diagnóstico';
    close.style.cssText = 'border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer';
    close.addEventListener('click', () => { panel.hidden = true; });
    head.append(title, close);

    list = document.createElement('div');
    list.style.cssText = 'display:grid;gap:.18rem';
    panel.append(head, list);
    document.body.append(panel);
    return panel;
  }

  function setRow(key, state, detail = '') {
    ensurePanel();
    rows.set(key, { state, detail });
    list.replaceChildren();
    for (const [name, value] of rows) {
      const row = document.createElement('div');
      const icon = value.state === 'ok' ? '✅' : value.state === 'error' ? '❌' : value.state === 'warn' ? '⚠️' : '⏳';
      row.textContent = `${icon} ${name}${value.detail ? `: ${value.detail}` : ''}`;
      row.style.wordBreak = 'break-word';
      list.append(row);
    }
  }

  function shortError(error) {
    const text = String(error?.message || error || 'erro descoñecido');
    return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  }

  async function testAsset(label, url) {
    setRow(label, 'pending', url);
    try {
      const response = await fetch(`${url}?debug=${Date.now()}`, { cache: 'no-store' });
      const type = response.headers.get('content-type') || 'sen content-type';
      const size = response.headers.get('content-length') || '?';
      if (!response.ok) throw new Error(`HTTP ${response.status} · ${type}`);
      const text = await response.text();
      if (!text || text.length < 1000) throw new Error(`resposta demasiado pequena (${text.length} bytes)`);
      setRow(label, 'ok', `HTTP ${response.status} · ${type} · ${size === '?' ? text.length : size} bytes`);
    } catch (error) {
      setRow(label, 'error', shortError(error));
    }
  }

  function inspectRuntime() {
    const mainScript = document.querySelector('script[data-ensaios-estudo-ui]');
    setRow('Script visor', mainScript ? 'ok' : 'error', mainScript?.getAttribute('src') || 'non atopado');

    const lib = window.pdfjsLib;
    setRow('PDF.js global', lib?.getDocument ? 'ok' : 'warn', lib?.version || (lib ? 'cargado sen getDocument' : 'aínda non cargado'));

    const viewer = document.querySelector('#score-viewer');
    const src = viewer instanceof HTMLIFrameElement ? (viewer.getAttribute('src') || '') : '';
    setRow('PDF privado', src ? 'ok' : 'pending', src ? src.split('#')[0].slice(0, 90) : 'agardando URL');

    const canvas = document.querySelector('#study-pdf-canvas');
    if (canvas instanceof HTMLCanvasElement) {
      setRow('Canvas', canvas.width > 0 && canvas.height > 0 ? 'ok' : 'warn', `${canvas.width}×${canvas.height}`);
    } else {
      setRow('Canvas', 'pending', 'aínda non creado');
    }

    const status = document.querySelector('.study-pdf-status');
    if (status instanceof HTMLElement && !status.hidden && status.textContent?.trim()) {
      setRow('Estado visor', /non foi posible|erro/i.test(status.textContent) ? 'error' : 'warn', status.textContent.trim());
    }
  }

  window.addEventListener('error', (event) => {
    setRow('Erro JavaScript', 'error', shortError(event.error || event.message));
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    setRow('Promesa rexeitada', 'error', shortError(event.reason));
  });

  ensurePanel();
  setRow('Diagnóstico', 'ok', navigator.userAgent);
  testAsset('pdf.min.js local', '/vendor/pdfjs/pdf.min.js');
  testAsset('pdf.worker local', '/vendor/pdfjs/pdf.worker.min.js');
  inspectRuntime();

  const observer = new MutationObserver(inspectRuntime);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'hidden'] });
  window.setInterval(inspectRuntime, 1200);
})();
