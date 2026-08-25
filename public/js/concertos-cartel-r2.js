(() => {
  'use strict';

  const rutas = new Map();
  const urls = new Map();

  const firebaseConfig = {
    apiKey: 'AIzaSyDrQY7NsaKpBfrSc8GqV3lUQDOIkecPZbs',
    authDomain: 'scpp-portal-privado.firebaseapp.com',
    projectId: 'scpp-portal-privado',
    storageBucket: 'scpp-portal-privado.firebasestorage.app',
    messagingSenderId: '506857659587',
    appId: '1:506857659587:web:a7ed36b22f044f5f639676'
  };

  const esCartelR2Novo = (ruta = '') => /^r2:\/\/concertos\/admin\/[^/]+\/cartel\//.test(String(ruta || ''));

  async function obterUsuario() {
    const [authMod, appMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js')
    ]);
    const apps = appMod.getApps();
    const app = apps[0] || appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);

    if (auth.currentUser) return auth.currentUser;

    return new Promise((resolve) => {
      let cancelar = () => {};
      const timer = window.setTimeout(() => {
        cancelar();
        resolve(auth.currentUser);
      }, 2500);
      cancelar = authMod.onAuthStateChanged(auth, (user) => {
        if (!user) return;
        window.clearTimeout(timer);
        cancelar();
        resolve(user);
      });
    });
  }

  async function urlCartel(id) {
    const concertoId = String(id || '').trim();
    if (!concertoId) throw new Error('Falta identificar o concerto.');
    if (urls.has(concertoId)) return urls.get(concertoId);

    const user = await obterUsuario();
    if (!user) throw new Error('A sesión non está dispoñible.');
    const idToken = await user.getIdToken();

    const resposta = await fetch('/api/concertos-cartel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, concertoId }),
      cache: 'no-store'
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => null);
      throw new Error(erro?.erro || 'Non foi posible obter o cartel.');
    }

    const blob = await resposta.blob();
    const url = URL.createObjectURL(blob);
    urls.set(concertoId, url);
    return url;
  }

  async function aplicarTarxeta(tarxeta) {
    if (!(tarxeta instanceof HTMLElement)) return;
    const id = String(tarxeta.getAttribute('data-id') || '');
    const ruta = rutas.get(id) || '';
    if (!esCartelR2Novo(ruta)) return;

    const img = tarxeta.querySelector('.classic-card-poster img');
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.cartelR2 === 'ok' || img.dataset.cartelR2 === 'loading') return;

    img.dataset.cartelR2 = 'loading';
    try {
      img.src = await urlCartel(id);
      img.dataset.cartelR2 = 'ok';
    } catch (erro) {
      img.dataset.cartelR2 = 'error';
      console.warn('Non foi posible cargar o cartel R2 do concerto.', erro);
    }
  }

  function aplicarTarxetas() {
    document.querySelectorAll('.concert-square[data-id]').forEach((tarxeta) => {
      void aplicarTarxeta(tarxeta);
    });
  }

  function cargarIndice(filas = []) {
    rutas.clear();
    (Array.isArray(filas) ? filas : []).forEach((fila) => {
      rutas.set(String(fila?.id || ''), String(fila?.cartel || ''));
    });
    window.setTimeout(aplicarTarxetas, 0);
  }

  async function aplicarDialogo(id) {
    const ruta = rutas.get(String(id || '')) || '';
    if (!esCartelR2Novo(ruta)) return;

    const dialogo = document.querySelector('#dialogo');
    const img = dialogo?.querySelector('#cartel-concerto-clasico');
    const media = dialogo?.querySelector('.concert-dialog-media');
    if (!(img instanceof HTMLImageElement) || !(media instanceof HTMLElement)) return;

    try {
      img.src = await urlCartel(id);
      media.hidden = false;
    } catch (erro) {
      console.warn('Non foi posible cargar o cartel R2 no detalle do concerto.', erro);
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest('[data-id],[data-report-id]');
    if (!card) return;
    const id = card.getAttribute('data-id') || card.getAttribute('data-report-id') || '';
    window.setTimeout(() => { void aplicarDialogo(id); }, 0);
  });

  const grid = document.querySelector('#grid');
  if (grid instanceof HTMLElement) {
    new MutationObserver(() => window.setTimeout(aplicarTarxetas, 0))
      .observe(grid, { childList: true, subtree: true });
  }

  cargarIndice(window.__scppConcertosIndice || []);
  window.addEventListener('scpp:concertos-indice', (event) => cargarIndice(event.detail || []));
  window.addEventListener('beforeunload', () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
  });
})();
