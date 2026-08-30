(() => {
  'use strict';

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== '/portal/repertorio') return;

  const style = document.createElement('style');
  style.textContent = `
    .repertorio-study-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.5rem;
      margin-top: 1rem;
      padding: .55rem .95rem;
      border: 1px solid var(--color-principal, #6a1b29);
      border-radius: 3px;
      background: var(--color-principal, #6a1b29);
      color: #fff !important;
      font-family: var(--fuente-minimalista, Aptos, Calibri, sans-serif);
      font-size: .78rem;
      font-weight: 800;
      line-height: 1.2;
      text-decoration: none !important;
    }
    .repertorio-study-action:hover {
      background: #4f0c1a;
      color: #fff !important;
    }
  `;
  document.head.append(style);

  function updateStudyLink() {
    const heading = document.querySelector('#work-detail .work-heading');
    if (!(heading instanceof HTMLElement)) return;

    const params = new URLSearchParams(window.location.search);
    const workId = String(params.get('id') || '').trim();

    let link = heading.querySelector('.repertorio-study-action');
    if (!workId) {
      link?.remove();
      return;
    }

    if (!(link instanceof HTMLAnchorElement)) {
      link = document.createElement('a');
      link.className = 'repertorio-study-action';
      link.textContent = 'Estudar obra';
      heading.append(link);
    }

    link.href = `/portal/ensaios/estudo-novo/?obra=${encodeURIComponent(workId)}`;
    link.setAttribute('aria-label', `Estudar a obra ${workId}`);
  }

  function setup() {
    const detail = document.querySelector('#work-detail');
    if (!(detail instanceof HTMLElement)) {
      window.setTimeout(setup, 120);
      return;
    }

    updateStudyLink();
    new MutationObserver(updateStudyLink).observe(detail, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden']
    });

    window.addEventListener('popstate', updateStudyLink);
    document.querySelector('#work-select')?.addEventListener('change', () => {
      window.setTimeout(updateStudyLink, 0);
    });
  }

  setup();
})();