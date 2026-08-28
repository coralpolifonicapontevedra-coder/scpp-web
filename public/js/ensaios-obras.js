(() => {
  'use strict';

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const isEnsaios = path === '/portal/ensaios';
  const isStudy = path === '/portal/ensaios/estudo';
  if (!isEnsaios && !isStudy) return;

  const style = document.createElement('style');
  style.textContent = `
    .study-actions {
      display: flex;
      flex-wrap: wrap;
      gap: .42rem;
      margin-top: .1rem;
    }
    .study-actions a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2rem;
      padding: .32rem .62rem;
      border: 1px solid #cfc6c1;
      border-radius: 5px;
      background: #fff;
      color: #514a46 !important;
      font-size: .76rem;
      font-weight: 800;
      line-height: 1.15;
      text-decoration: none !important;
    }
    .study-actions a:hover {
      border-color: var(--color-principal, #6a1b29);
      color: var(--color-principal, #6a1b29) !important;
      background: #faf5f6;
    }
    .study-actions .study-work-button {
      border-color: var(--color-principal, #6a1b29);
      background: var(--color-principal, #6a1b29);
      color: #fff !important;
    }
    .study-actions .study-work-button:hover {
      background: #541522;
      color: #fff !important;
    }

    .study-main.from-ensaios { padding-top: .85rem; }
    .study-main.from-ensaios .study-header {
      align-items: center;
      gap: .8rem;
      margin-bottom: .55rem;
    }
    .study-main.from-ensaios .study-header h1 {
      margin: .08rem 0;
      font-size: clamp(1.35rem, 2.2vw, 1.8rem);
    }
    .study-main.from-ensaios .study-header p,
    .study-main.from-ensaios .study-header .kicker {
      display: none;
    }
    .study-main.from-ensaios .back-link { font-size: .8rem; }
    .study-main.from-ensaios .study-app { gap: .5rem; }
    .study-main.from-ensaios .study-card { padding: .58rem .7rem; }
    .study-main.from-ensaios .selectors {
      grid-template-columns: minmax(220px, 420px);
      justify-content: start;
      gap: .4rem;
    }
    .study-main.from-ensaios .selectors > label:nth-child(1),
    .study-main.from-ensaios .selectors > label:nth-child(2) {
      display: none;
    }
    .study-main.from-ensaios .selectors select {
      min-height: 2.35rem;
      padding: .38rem .55rem;
      font-size: .86rem;
    }
    .study-main.from-ensaios .now-playing { padding-top: .48rem; padding-bottom: .48rem; }
    .study-main.from-ensaios .now-playing .kicker { display: none; }
    .study-main.from-ensaios .now-playing h2 { margin: 0; font-size: 1.05rem; }
    .study-main.from-ensaios .now-playing p { font-size: .76rem; }
    .study-main.from-ensaios .voice-badge {
      min-height: 1.65rem;
      padding: .2rem .5rem;
      font-size: .7rem;
    }
    .study-main.from-ensaios .audio-panel {
      grid-template-columns: minmax(140px, .28fr) minmax(260px, 1fr);
      gap: .65rem;
      padding: .48rem .65rem;
    }
    .study-main.from-ensaios .audio-copy { gap: 0; }
    .study-main.from-ensaios .audio-copy strong { font-size: .82rem; }
    .study-main.from-ensaios .audio-copy small { display: none; }
    .study-main.from-ensaios #audio-player { height: 36px; }
    .study-main.from-ensaios .score-toolbar {
      grid-template-columns: 100px 125px 100px;
      gap: .42rem;
      padding: .38rem .55rem;
    }
    .study-main.from-ensaios .page-button {
      min-height: 2.15rem;
      padding: .3rem .5rem;
      font-size: .76rem;
    }
    .study-main.from-ensaios .page-field {
      grid-template-columns: auto 54px;
      gap: .3rem;
    }
    .study-main.from-ensaios .page-field small { display: none; }
    .study-main.from-ensaios .page-field input {
      min-height: 2rem;
      font-size: .82rem;
    }

    @media (max-width: 760px) {
      .study-actions { gap: .35rem; }
      .study-actions a {
        flex: 1 1 auto;
        min-height: 1.9rem;
        padding: .3rem .5rem;
        font-size: .72rem;
      }
      .study-main.from-ensaios {
        padding: .45rem .45rem 4.25rem;
      }
      .study-main.from-ensaios .study-header {
        display: flex;
        justify-content: space-between;
        padding: 0 .1rem;
      }
      .study-main.from-ensaios .study-header h1 { font-size: 1.2rem; }
      .study-main.from-ensaios .selectors {
        grid-template-columns: 1fr;
        padding: .5rem;
      }
      .study-main.from-ensaios .selectors label > span {
        font-size: .68rem;
      }
      .study-main.from-ensaios .selectors select {
        min-height: 2.45rem;
        font-size: .88rem;
      }
      .study-main.from-ensaios .now-playing {
        padding: .45rem .55rem;
      }
      .study-main.from-ensaios .audio-panel {
        grid-template-columns: 1fr;
        gap: .28rem;
        padding: .42rem .5rem;
      }
      .study-main.from-ensaios .audio-copy strong { font-size: .75rem; }
      .study-main.from-ensaios .score-toolbar {
        display: none;
      }
      .study-main.from-ensaios .score-frame {
        height: calc(100dvh - 205px);
        min-height: 440px;
      }
      .study-main.from-ensaios .mobile-page-nav {
        left: .4rem;
        right: .4rem;
        bottom: max(.35rem, env(safe-area-inset-bottom));
        gap: .3rem;
        padding: .32rem;
        border-radius: 7px;
      }
      .study-main.from-ensaios .mobile-page-nav button {
        min-height: 2.55rem;
        padding: .3rem .45rem;
        font-size: .78rem;
      }
      .study-main.from-ensaios .mobile-page-nav strong {
        min-width: 52px;
        font-size: .7rem;
      }
    }
  `;
  document.head.append(style);

  function enhanceWorks() {
    const list = document.querySelector('#works-list');
    if (!(list instanceof HTMLElement)) return;
    const rehearsal = document.querySelector('#ensaio-select');
    const rehearsalId = rehearsal instanceof HTMLSelectElement ? rehearsal.value : '';

    list.querySelectorAll('.work-card[data-work]').forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const workId = String(card.dataset.work || '').trim();
      if (!workId) return;

      let actions = card.querySelector('.study-actions');
      if (!(actions instanceof HTMLElement)) {
        actions = document.createElement('div');
        actions.className = 'study-actions';

        const repertoire = document.createElement('a');
        repertoire.className = 'repertoire-work-button';
        repertoire.textContent = 'Repertorio';
        actions.append(repertoire);

        const study = document.createElement('a');
        study.className = 'study-work-button';
        study.textContent = 'Estudar obra';
        actions.append(study);

        card.append(actions);
      }

      const repertoire = actions.querySelector('.repertoire-work-button');
      const study = actions.querySelector('.study-work-button');
      if (repertoire instanceof HTMLAnchorElement) {
        repertoire.href = `/portal/repertorio/?id=${encodeURIComponent(workId)}`;
      }
      if (study instanceof HTMLAnchorElement) {
        const params = new URLSearchParams({ obra: workId });
        if (rehearsalId) params.set('ensaio', rehearsalId);
        study.href = `/portal/ensaios/estudo-novo/?${params.toString()}`;
      }
    });
  }

  function setupEnsaios() {
    const list = document.querySelector('#works-list');
    if (!(list instanceof HTMLElement)) {
      window.setTimeout(setupEnsaios, 120);
      return;
    }
    enhanceWorks();
    new MutationObserver(enhanceWorks).observe(list, { childList: true, subtree: true });
    const rehearsal = document.querySelector('#ensaio-select');
    if (rehearsal instanceof HTMLSelectElement) {
      rehearsal.addEventListener('change', () => window.setTimeout(enhanceWorks, 0));
    }
  }

  function setupStudy() {
    const params = new URLSearchParams(window.location.search);
    const workId = String(params.get('obra') || '').trim();
    const rehearsalId = String(params.get('ensaio') || '').trim();
    if (!workId) return;

    const main = document.querySelector('.study-main');
    if (main instanceof HTMLElement) main.classList.add('from-ensaios');
    const title = document.querySelector('.study-header h1');
    if (title instanceof HTMLElement) title.textContent = 'Estudo da obra';

    const startedAt = Date.now();
    let rehearsalApplied = !rehearsalId;
    let workApplied = false;

    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > 10000 || workApplied) {
        window.clearInterval(timer);
        return;
      }

      const rehearsal = document.querySelector('#rehearsal-select');
      const work = document.querySelector('#work-select');

      if (!rehearsalApplied && rehearsal instanceof HTMLSelectElement) {
        const hasRehearsal = Array.from(rehearsal.options).some((option) => option.value === rehearsalId);
        if (hasRehearsal) {
          if (rehearsal.value !== rehearsalId) {
            rehearsal.value = rehearsalId;
            rehearsal.dispatchEvent(new Event('change', { bubbles: true }));
          }
          rehearsalApplied = true;
        }
      }

      if (rehearsalApplied && work instanceof HTMLSelectElement) {
        const hasWork = Array.from(work.options).some((option) => option.value === workId);
        if (hasWork) {
          if (work.value !== workId) {
            work.value = workId;
            work.dispatchEvent(new Event('change', { bubbles: true }));
          }
          workApplied = true;
          window.clearInterval(timer);
        }
      }
    }, 120);
  }

  if (isEnsaios) setupEnsaios();
  if (isStudy) setupStudy();
})();
