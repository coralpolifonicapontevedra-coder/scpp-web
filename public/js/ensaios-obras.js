(() => {
  'use strict';

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== '/portal/ensaios') return;

  const style = document.createElement('style');
  style.textContent = `
    .study-actions {
      display: flex;
      flex-wrap: wrap;
      gap: .42rem;
      margin-top: .18rem;
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
    .study-actions .study-work-button {
      border-color: var(--color-principal, #6a1b29);
      background: var(--color-principal, #6a1b29);
      color: #fff !important;
    }
    .study-actions .study-work-button:hover {
      background: #541522;
      color: #fff !important;
    }

    @media (max-width: 700px) {
      body.portal-private-body .private-main {
        width: 100% !important;
        min-width: 0 !important;
        padding: .65rem !important;
        overflow-x: hidden !important;
      }
      body.portal-private-body #works.card {
        padding: .65rem !important;
      }
      body.portal-private-body #works-list.works-grid {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        gap: .48rem !important;
        width: 100% !important;
        min-width: 0 !important;
      }
      body.portal-private-body #works-list .work-card {
        width: 100% !important;
        min-width: 0 !important;
        gap: .42rem !important;
        padding: .62rem .68rem !important;
        border-radius: 6px !important;
      }
      body.portal-private-body #works-list .work-card header {
        display: grid !important;
        grid-template-columns: 30px minmax(0, 1fr) auto !important;
        gap: .5rem !important;
        align-items: start !important;
        min-width: 0 !important;
      }
      body.portal-private-body #works-list .work-card header > div {
        min-width: 0 !important;
      }
      body.portal-private-body #works-list .work-card a {
        display: block !important;
        min-width: 0 !important;
        overflow-wrap: anywhere !important;
        font-size: .96rem !important;
        line-height: 1.22 !important;
      }
      body.portal-private-body #works-list .work-card small {
        margin-top: .12rem !important;
        font-size: .78rem !important;
        line-height: 1.25 !important;
      }
      body.portal-private-body #works-list .num {
        width: 28px !important;
        height: 28px !important;
        font-size: .8rem !important;
      }
      body.portal-private-body #works-list .work-card p {
        margin: .18rem 0 !important;
        font-size: .78rem !important;
        line-height: 1.3 !important;
      }
      body.portal-private-body #works-list .work-card.is-invalid-work {
        grid-template-columns: 1fr !important;
        min-height: 0 !important;
        padding: .55rem .65rem !important;
        border-color: #dec7cc !important;
        background: #fffafa !important;
      }
      body.portal-private-body #works-list .work-card.is-invalid-work header {
        align-items: center !important;
      }
      body.portal-private-body #works-list .work-card.is-invalid-work .study-actions {
        display: none !important;
      }
      .study-actions {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: .35rem !important;
        width: 100% !important;
      }
      .study-actions a {
        width: 100% !important;
        min-height: 2.15rem !important;
        padding: .34rem .42rem !important;
        font-size: .72rem !important;
      }
    }
  `;
  document.head.append(style);

  function enhanceWorks() {
    const list = document.querySelector('#works-list');
    if (!(list instanceof HTMLElement)) return;

    list.querySelectorAll('.work-card[data-work]').forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const workId = String(card.dataset.work || '').trim();
      if (!workId) return;

      const text = String(card.textContent || '').toLowerCase();
      const anchor = card.querySelector('header a');
      const unresolved = text.includes('rexistro de obra incorrecto') ||
        (anchor instanceof HTMLAnchorElement && anchor.textContent?.trim() === workId);
      card.classList.toggle('is-invalid-work', Boolean(unresolved));

      if (unresolved) {
        card.querySelector('.study-actions')?.remove();
        return;
      }

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
        study.href = `/portal/ensaios/estudo-novo/?obra=${encodeURIComponent(workId)}`;
      }
    });
  }

  function setup() {
    const list = document.querySelector('#works-list');
    if (!(list instanceof HTMLElement)) {
      window.setTimeout(setup, 120);
      return;
    }
    enhanceWorks();
    new MutationObserver(enhanceWorks).observe(list, { childList: true, subtree: true });
  }

  setup();
})();
