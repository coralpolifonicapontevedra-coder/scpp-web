(() => {
  'use strict';

  if (!window.location.pathname.startsWith('/portal/administracion/concertos')) return;
  if (window.__scppConcertosAdminInforme) return;
  window.__scppConcertosAdminInforme = true;

  let ultimoToken = '';
  const fetchOriginal = window.fetch.bind(window);

  const hoxeLocal = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  async function obterInforme(idToken) {
    if (!idToken) return null;
    const response = await fetchOriginal('/api/concertos-admin-informe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, accion: 'obter' })
    });
    if (response.status === 404) return null;
    const result = await response.json().catch(() => null);
    return response.ok && result?.ok ? result : null;
  }

  async function xerarInforme(idToken, inicio, fin, silencioso = false) {
    if (!idToken || !inicio || !fin) return null;
    const response = await fetchOriginal('/api/concertos-admin-informe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, accion: 'xerar', inicio, fin })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      if (!silencioso) throw new Error(result?.erro || `Erro HTTP ${response.status}`);
      return null;
    }
    return result;
  }

  async function rexenerarPeriodoActual(idToken) {
    const actual = await obterInforme(idToken);
    const inicio = String(actual?.periodo?.inicio || '');
    const fin = String(actual?.periodo?.fin || '');
    if (!inicio || !fin) return null;
    return xerarInforme(idToken, inicio, fin, true);
  }

  window.fetch = async (input, init) => {
    let body = null;
    try {
      if (typeof init?.body === 'string') {
        body = JSON.parse(init.body);
        if (body?.idToken) ultimoToken = String(body.idToken);
      }
    } catch {}

    const response = await fetchOriginal(input, init);

    try {
      const valor = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(valor, window.location.href);
      if (url.pathname === '/api/concertos-admin' && body?.accion === 'finalizarXestion' && response.ok && ultimoToken) {
        rexenerarPeriodoActual(ultimoToken);
      }
    } catch {}

    return response;
  };

  async function cargarPeriodoGardado(inicioInput, finInput, estado) {
    if (!ultimoToken) return;
    const actual = await obterInforme(ultimoToken);
    if (!actual?.periodo) return;
    if (inicioInput instanceof HTMLInputElement && actual.periodo.inicio) inicioInput.value = String(actual.periodo.inicio);
    if (finInput instanceof HTMLInputElement && actual.periodo.fin) finInput.value = String(actual.periodo.fin);
    if (estado instanceof HTMLElement) {
      estado.textContent = `Último informe: ${actual.periodo.inicio} → ${actual.periodo.fin}`;
    }
  }

  function engadirPanel() {
    const toolbar = document.querySelector('.admin-concerts-main .toolbar');
    if (!(toolbar instanceof HTMLElement) || document.querySelector('#attendance-report-admin')) return;

    const panel = document.createElement('section');
    panel.id = 'attendance-report-admin';
    panel.style.cssText = 'display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,1fr) auto;gap:.8rem 1rem;align-items:end;margin:-.45rem 0 1.25rem;padding:1rem 1.15rem;border:1px solid #ded8d3;background:#fff';
    panel.innerHTML = `
      <label style="display:grid;gap:.4rem;font-size:.82rem"><span>Data inicial</span><input id="attendance-report-start" type="date" style="min-height:2.55rem;padding:.5rem .65rem;border:1px solid #d6cfca;background:#fff;font:inherit"></label>
      <label style="display:grid;gap:.4rem;font-size:.82rem"><span>Data final</span><input id="attendance-report-end" type="date" style="min-height:2.55rem;padding:.5rem .65rem;border:1px solid #d6cfca;background:#fff;font:inherit"></label>
      <button id="refresh-attendance-report" type="button" class="secondary">Xerar informe de asistencia</button>
      <p id="attendance-report-admin-status" style="grid-column:1/-1;margin:0;color:#6f6561;font-size:.78rem">Só computan concertos realizados dentro do período.</p>`;

    toolbar.insertAdjacentElement('afterend', panel);

    const inicioInput = panel.querySelector('#attendance-report-start');
    const finInput = panel.querySelector('#attendance-report-end');
    const button = panel.querySelector('#refresh-attendance-report');
    const estado = panel.querySelector('#attendance-report-admin-status');
    const hoxe = hoxeLocal();
    if (inicioInput instanceof HTMLInputElement) inicioInput.value = `${hoxe.slice(0, 4)}-01-01`;
    if (finInput instanceof HTMLInputElement) finInput.value = hoxe;

    setTimeout(() => cargarPeriodoGardado(inicioInput, finInput, estado), 300);

    button?.addEventListener('click', async () => {
      if (!ultimoToken) {
        if (estado instanceof HTMLElement) estado.textContent = 'A sesión aínda non está preparada. Recarga a páxina e téntao de novo.';
        return;
      }
      const inicio = inicioInput instanceof HTMLInputElement ? inicioInput.value : '';
      const fin = finInput instanceof HTMLInputElement ? finInput.value : '';
      if (!inicio || !fin) {
        if (estado instanceof HTMLElement) estado.textContent = 'Indica a data inicial e a data final.';
        return;
      }
      if (inicio > fin) {
        if (estado instanceof HTMLElement) estado.textContent = 'A data inicial non pode ser posterior á data final.';
        return;
      }

      const texto = button instanceof HTMLButtonElement ? button.textContent : '';
      if (button instanceof HTMLButtonElement) {
        button.disabled = true;
        button.textContent = 'Xerando informe…';
      }
      if (estado instanceof HTMLElement) estado.textContent = 'Calculando asistencias e gardando o informe en R2…';

      try {
        const result = await xerarInforme(ultimoToken, inicio, fin);
        const resumo = result?.resumo || {};
        if (estado instanceof HTMLElement) {
          estado.textContent = `Informe ${inicio} → ${fin}: ${resumo.persoas || 0} persoas · ${resumo.asistencias || 0} asistencias · ${resumo.concertos || 0} concertos con asistencia (${resumo.concertosRealizadosPeriodo || 0} realizados no período).`;
        }
      } catch (error) {
        if (estado instanceof HTMLElement) estado.textContent = error instanceof Error ? error.message : 'Non foi posible xerar o informe.';
      } finally {
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
          button.textContent = texto || 'Xerar informe de asistencia';
        }
      }
    });
  }

  const observer = new MutationObserver(engadirPanel);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  engadirPanel();
})();
