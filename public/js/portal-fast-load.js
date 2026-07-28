(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);
  const ACCEPTANCE_TTL = 30 * 60 * 1000;
  const REPERTORIO_CACHE_TTL = 24 * 60 * 60 * 1000;
  const REPERTORIO_REFRESH_TTL = 30 * 60 * 1000;
  const REPERTORIO_CACHE_KEY = 'scpp:repertorio:completo:v2';
  const REPERTORIO_REFRESH_KEY = 'scpp:repertorio:refresco:v2';

  const URL_CONCERTOS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSX8BEJ-hrubqEtaZ1zZaLSy7LoxaDQOuQuqR2ior7TZErtBGL5bJG0B_AK5Dp8eFeTDb3Pmpqh7Hnu/pub?gid=1098509641&single=true&output=csv';
  const URL_PROGRAMAS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTMm4Z45Bcfz_-AEwcA6lNmttLAjJEOxXpTFmlnLwtRCoSIF7xlCP-LEdlfLoMYkbOnAefC7I9G9Cec/pub?gid=1925601694&single=true&output=csv';
  const URL_REPERTORIO = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSuYtrIlKLbU1QkH7fP2zbKQQYFV6kvACLLFBZrJ7cC8t54jAsrTDWvL_x7fko9Hw71oKIoYyBcjNF3/pub?gid=984049442&single=true&output=csv';

  let fastWorksPromise = null;

  const jsonResponse = (body, headers = {}) => new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-SCPP-Fast-Load': '1',
      ...headers
    }
  });

  const normalizar = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const canonWorkId = (value = '') => {
    const raw = String(value).trim();
    if (/^\d+$/.test(raw)) return String(Number(raw)).padStart(2, '0');
    return raw;
  };

  const valor = (row, ...names) => {
    for (const name of names) {
      const found = row[normalizar(name)];
      if (found !== undefined && found !== '') return found;
    }
    return '';
  };

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const current = text[index];
      const next = text[index + 1];
      if (current === '"' && quoted && next === '"') {
        field += '"';
        index += 1;
      } else if (current === '"') {
        quoted = !quoted;
      } else if (current === ',' && !quoted) {
        row.push(field);
        field = '';
      } else if ((current === '\n' || current === '\r') && !quoted) {
        if (current === '\r' && next === '\n') index += 1;
        row.push(field);
        if (row.some((item) => item.trim() !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += current;
      }
    }

    if (field || row.length) {
      row.push(field);
      if (row.some((item) => item.trim() !== '')) rows.push(row);
    }

    const headers = (rows.shift() || []).map(normalizar);
    return rows.map((values) => Object.fromEntries(
      headers.map((header, index) => [header, String(values[index] || '').trim()])
    ));
  }

  async function readCSV(url) {
    const response = await originalFetch(url, { cache: 'default' });
    if (!response.ok) throw new Error(`Non se puido ler unha das follas (${response.status}).`);
    return parseCSV(await response.text());
  }

  function dateISO(value = '') {
    const parts = String(value).split(/[\/-]/).map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
    if (parts[0] > 31) return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
    return `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
  }

  function readFullCache() {
    try {
      const stored = JSON.parse(localStorage.getItem(REPERTORIO_CACHE_KEY) || 'null');
      if (!stored || !Array.isArray(stored.obras) || Date.now() - Number(stored.savedAt || 0) > REPERTORIO_CACHE_TTL) {
        return null;
      }
      return stored;
    } catch {
      return null;
    }
  }

  function saveFullCache(result) {
    if (!result?.ok || !Array.isArray(result.obras) || !result.obras.length) return;
    try {
      localStorage.setItem(REPERTORIO_CACHE_KEY, JSON.stringify({
        ok: true,
        obras: result.obras,
        savedAt: Date.now()
      }));
      localStorage.setItem(REPERTORIO_REFRESH_KEY, String(Date.now()));
    } catch {
      // A caché é unha mellora, non debe impedir o funcionamento do portal.
    }
  }

  function cachedAudioMap() {
    const cached = readFullCache();
    const map = new Map();
    for (const work of cached?.obras || []) {
      map.set(canonWorkId(work.id), Array.isArray(work.audios) ? work.audios : []);
    }
    return map;
  }

  async function buildFastWorks() {
    if (fastWorksPromise) return fastWorksPromise;

    fastWorksPromise = (async () => {
      const [repertoireRows, programRows, concertRows] = await Promise.all([
        readCSV(URL_REPERTORIO),
        readCSV(URL_PROGRAMAS),
        readCSV(URL_CONCERTOS)
      ]);

      const concertMap = new Map();
      for (const row of concertRows) {
        const id = valor(row, 'Id', 'Row ID');
        if (!id) continue;
        concertMap.set(id, {
          id,
          data: valor(row, 'Data'),
          nome: valor(row, 'Nome') || 'Concerto',
          cidade: valor(row, 'Cidade'),
          lugar: valor(row, 'Lugar')
        });
      }

      const concertsByWork = new Map();
      for (const row of programRows) {
        const workId = canonWorkId(valor(row, 'Id_Obras', 'Id Obras', 'Obra'));
        const concertId = valor(row, 'Id_Conciertos', 'Id_Concertos', 'Id Concertos');
        if (!workId || !concertId) continue;
        const concert = concertMap.get(concertId);
        if (!concert) continue;
        if (!concertsByWork.has(workId)) concertsByWork.set(workId, []);
        concertsByWork.get(workId).push({
          ...concert,
          orde: Number(valor(row, 'Orde')) || '',
          solista: valor(row, 'Solista')
        });
      }

      for (const concerts of concertsByWork.values()) {
        concerts.sort((a, b) => dateISO(b.data).localeCompare(dateISO(a.data)));
      }

      const audioMap = cachedAudioMap();
      return repertoireRows
        .map((row) => {
          const id = canonWorkId(valor(row, 'Id', 'Row ID'));
          const name = valor(row, 'NomeObra', 'Nome', 'Obra', 'Título', 'Titulo');
          const scorePath = valor(row, 'Partitura');
          return {
            id,
            nomeObra: name,
            autorLetra: valor(row, 'AutorLetra', 'Autor letra'),
            compositor: valor(row, 'Compositor', 'Autor'),
            datas: valor(row, 'Nac/fall', 'Datas'),
            comentarios: valor(row, 'Comentarios', 'Observacións', 'Observacions'),
            partituras: scorePath ? [{ nome: name, ruta: scorePath }] : [],
            audios: audioMap.get(id) || [],
            concertos: concertsByWork.get(id) || []
          };
        })
        .filter((work) => work.id && work.nomeObra)
        .sort((a, b) => a.nomeObra.localeCompare(b.nomeObra, 'gl', { sensitivity: 'base' }));
    })().catch((error) => {
      fastWorksPromise = null;
      throw error;
    });

    return fastWorksPromise;
  }

  function decodeTokenEmail(token = '') {
    try {
      const payload = token.split('.')[1];
      if (!payload) return 'sesion';
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(decodeURIComponent(atob(normalized).split('').map((char) =>
        `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
      ).join('')));
      return String(decoded.email || decoded.user_id || 'sesion').toLowerCase();
    } catch {
      return 'sesion';
    }
  }

  function acceptanceKey(body) {
    const version = String(body?.version || 'PRIVACIDADE-WEB-1.0');
    return `scpp:aceptacion:${decodeTokenEmail(body?.idToken)}:${version}`;
  }

  function readAcceptance(body) {
    try {
      const timestamp = Number(sessionStorage.getItem(acceptanceKey(body)) || 0);
      return timestamp > 0 && Date.now() - timestamp < ACCEPTANCE_TTL;
    } catch {
      return false;
    }
  }

  function saveAcceptance(body) {
    try {
      sessionStorage.setItem(acceptanceKey(body), String(Date.now()));
    } catch {
      // Sen almacenamento de sesión simplemente mantense a comprobación normal.
    }
  }

  function parseBody(init) {
    if (!init || typeof init.body !== 'string') return null;
    try {
      return JSON.parse(init.body);
    } catch {
      return null;
    }
  }

  function shouldRefreshRepertoire() {
    try {
      const refreshedAt = Number(localStorage.getItem(REPERTORIO_REFRESH_KEY) || 0);
      return Date.now() - refreshedAt > REPERTORIO_REFRESH_TTL;
    } catch {
      return true;
    }
  }

  function markAudioLoading() {
    window.__scppRepertorioFastMode = true;
    const update = () => {
      const empty = document.querySelector('#audios-empty');
      if (!(empty instanceof HTMLElement)) return;
      const count = document.querySelector('#audio-count');
      const list = document.querySelector('#audios-list');
      if (list?.children.length) return;
      empty.hidden = false;
      empty.textContent = 'Os audios están actualizándose en segundo plano. O resto do repertorio xa está dispoñible.';
      if (count instanceof HTMLElement) count.textContent = 'actualizando…';
    };
    document.addEventListener('DOMContentLoaded', update, { once: true });
    const observer = new MutationObserver(update);
    document.addEventListener('DOMContentLoaded', () => {
      const target = document.querySelector('#work-detail');
      if (target) observer.observe(target, { childList: true, subtree: true });
      update();
    }, { once: true });
  }

  function showAudioReadyNotice() {
    if (document.querySelector('[data-scpp-audios-ready]')) return;
    const notice = document.createElement('div');
    notice.dataset.scppAudiosReady = 'true';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;right:1rem;bottom:1rem;z-index:1000;display:flex;gap:.8rem;align-items:center;max-width:420px;padding:.85rem 1rem;border:1px solid #6b1d2f;background:#fff;color:#3d3936;box-shadow:0 12px 32px rgba(0,0,0,.14);font:14px Aptos,Calibri,sans-serif';
    const copy = document.createElement('span');
    copy.textContent = 'Os audios xa están preparados.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Actualizar';
    button.style.cssText = 'padding:.45rem .7rem;border:1px solid #6b1d2f;background:#6b1d2f;color:#fff;font:inherit;font-weight:700;cursor:pointer';
    button.addEventListener('click', () => window.location.reload());
    notice.append(copy, button);
    document.body.append(notice);
  }

  async function backgroundFullRequest(input, init) {
    if (!shouldRefreshRepertoire()) return null;
    try {
      localStorage.setItem(REPERTORIO_REFRESH_KEY, String(Date.now()));
    } catch {
      // Continúa sen bloqueo se o navegador non permite almacenamento.
    }

    try {
      const response = await originalFetch(input, init);
      const result = await response.clone().json().catch(() => null);
      if (response.ok && result?.ok && Array.isArray(result.obras)) {
        const hadCachedAudios = Boolean(readFullCache());
        saveFullCache(result);
        if (!hadCachedAudios && location.pathname.startsWith('/portal/repertorio')) {
          showAudioReadyNotice();
        }
        return result;
      }
    } catch {
      // A carga rápida xa mantén a páxina operativa.
    }
    return null;
  }

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const body = parseBody(init);

    if (url.includes('/api/aceptacion') && body?.accion === 'comprobarAceptacion') {
      if (readAcceptance(body)) {
        return jsonResponse({ ok: true, aceptacionVixente: true }, { 'X-SCPP-Acceptance-Cache': 'HIT' });
      }
      const response = await originalFetch(input, init);
      const result = await response.clone().json().catch(() => null);
      if (response.ok && result?.ok && result.aceptacionVixente === true) saveAcceptance(body);
      return response;
    }

    if (
      location.pathname.startsWith('/portal/repertorio') &&
      url.includes('/api/repertorio') &&
      body?.accion === 'listarRepertorioPortal'
    ) {
      const cached = readFullCache();
      const background = backgroundFullRequest(input, init);

      try {
        const works = await buildFastWorks();
        if (!cached) markAudioLoading();

        const quickFull = await Promise.race([
          background,
          new Promise((resolve) => setTimeout(() => resolve(null), 2200))
        ]);
        if (quickFull?.ok && Array.isArray(quickFull.obras)) {
          return jsonResponse(quickFull, { 'X-SCPP-Repertorio': 'FULL' });
        }
        return jsonResponse({ ok: true, obras: works, modoCarga: 'csv' }, { 'X-SCPP-Repertorio': 'CSV' });
      } catch {
        if (cached) return jsonResponse(cached, { 'X-SCPP-Repertorio': 'LOCAL' });
        const full = await background;
        if (full?.ok) return jsonResponse(full, { 'X-SCPP-Repertorio': 'FULL-FALLBACK' });
        return jsonResponse({ ok: false, erro: 'Non foi posible ler as fontes do repertorio.' });
      }
    }

    return originalFetch(input, init);
  };
})();
