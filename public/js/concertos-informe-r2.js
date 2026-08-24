(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/concertos')) return;
  if (window.__scppConcertosInformeR2) return;
  window.__scppConcertosInformeR2 = true;

  let idToken = '';
  const fetchOriginal = window.fetch.bind(window);
  const escapar = (v = '') => String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  window.fetch = async (input, init) => {
    try {
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body);
        if (body?.idToken) idToken = String(body.idToken);
      }
    } catch {}
    return fetchOriginal(input, init);
  };

  function pintar(data) {
    const box = document.querySelector('#informe');
    const resumo = document.querySelector('#resumo-informe');
    const baleiro = document.querySelector('#informe-baleiro');
    if (!(box instanceof HTMLElement)) return;

    const niveis = Array.isArray(data?.informe?.niveis) ? data.informe.niveis : [];
    box.innerHTML = niveis.map((nivel) => `
      <section class="attendance-tier" data-informe-r2="1">
        <header><strong>${Number(nivel.totalConcertos || 0)} concerto${Number(nivel.totalConcertos || 0) === 1 ? '' : 's'}</strong><span>${Number(nivel.totalPersoas || 0)} persoa${Number(nivel.totalPersoas || 0) === 1 ? '' : 's'}</span></header>
        <div class="report-voices">${(Array.isArray(nivel.voces) ? nivel.voces : []).map((grupo) => `
          <section class="report-voice">
            <h3>${escapar(grupo.voz || 'Sen voz indicada')} <span>${Array.isArray(grupo.persoas) ? grupo.persoas.length : 0}</span></h3>
            <div>${(Array.isArray(grupo.persoas) ? grupo.persoas : []).map((p) => `
              <article class="person-report">
                <header><strong>${escapar(p.nome)}</strong><span>${Array.isArray(p.concertos) ? p.concertos.length : 0}</span></header>
                <ul>${(Array.isArray(p.concertos) ? p.concertos : []).map((c) => `<li><button type="button" data-report-id="${escapar(c.id)}"><time>${escapar(c.data)}</time><span>${escapar(c.nome)}</span></button></li>`).join('')}</ul>
              </article>`).join('')}</div>
          </section>`).join('')}</div>
      </section>`).join('');

    const r = data?.resumo || {};
    if (resumo) resumo.textContent = `${Number(r.persoas || 0)} persoas · ${Number(r.asistencias || 0)} asistencias`;
    if (baleiro instanceof HTMLElement) baleiro.hidden = niveis.length > 0;
  }

  async function cargar() {
    if (!idToken) return null;
    const response = await fetchOriginal('/api/concertos-informe-asistencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store'
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.erro || `Erro HTTP ${response.status}`);
    return data;
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    const botao = target instanceof Element ? target.closest('#ver-informe') : null;
    if (!botao) return;

    setTimeout(async () => {
      try {
        const data = await cargar();
        if (!data) return;
        pintar(data);
        setTimeout(() => pintar(data), 500);
      } catch (error) {
        const box = document.querySelector('#informe');
        if (box instanceof HTMLElement && !box.children.length) {
          box.innerHTML = `<p class="no-results">${escapar(error instanceof Error ? error.message : 'Non foi posible cargar o informe.')}</p>`;
        }
      }
    }, 0);
  });
})();
