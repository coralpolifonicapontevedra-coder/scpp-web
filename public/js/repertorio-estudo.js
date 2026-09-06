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

    /* Ficha de obra: mesma lectura visual que Persoas.
       Cada campo queda acoutado nun rectángulo propio e a etiqueta
       sepárase claramente do valor para evitar que os campos se peguen. */
    #work-detail .work-metadata {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: .85rem !important;
      padding: 1.15rem 1.8rem !important;
      border-bottom: 1px solid #e5e1dd !important;
    }
    #work-detail .work-metadata > div {
      min-width: 0;
      padding: .85rem .9rem !important;
      border: 1px solid #e0d9d5 !important;
      background: #fff;
    }
    #work-detail .work-metadata > div + div {
      padding-left: .9rem !important;
      border-left: 1px solid #e0d9d5 !important;
    }
    #work-detail .work-metadata dt {
      display: inline-flex;
      width: fit-content;
      max-width: 100%;
      box-sizing: border-box;
      padding: .24rem .48rem;
      border: 1px solid #cfc4bf;
      background: #f8f6f4;
      color: #5d142b !important;
      font-size: .68rem !important;
      font-weight: 800 !important;
      line-height: 1.2;
      letter-spacing: .06em !important;
      text-transform: uppercase;
    }
    #work-detail .work-metadata dd {
      display: block;
      min-height: 1.15rem;
      margin: .58rem 0 0 !important;
      color: #3d3936;
      font-size: .84rem !important;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    @media (max-width: 1050px) {
      #work-detail .work-metadata {
        grid-template-columns: 1fr !important;
        gap: .65rem !important;
      }
      #work-detail .work-metadata > div,
      #work-detail .work-metadata > div + div {
        padding: .8rem .85rem !important;
        border: 1px solid #e0d9d5 !important;
      }
    }

    @media (max-width: 680px) {
      #work-detail .work-metadata {
        padding-left: 1.15rem !important;
        padding-right: 1.15rem !important;
      }
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