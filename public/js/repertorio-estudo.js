(() => {
  'use strict';

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const isPortalRepertorio = path === '/portal/repertorio';
  const isAdminRepertorio = path === '/portal/administracion/repertorio';
  if (!isPortalRepertorio && !isAdminRepertorio) return;

  const style = document.createElement('style');
  style.textContent = `
    ${isPortalRepertorio ? `
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
    ` : ''}

    ${isAdminRepertorio ? `
    /* Administración → Repertorio.
       Patrón visual de Persoas: etiqueta acoutada + valor independente. */
    #detail.detail.card {
      max-width: 1220px !important;
    }
    #detail .detail-sections {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 1rem !important;
      padding: 1.2rem 1.35rem !important;
      border-bottom: 1px solid #e5dfda !important;
      background: #fbfaf9 !important;
    }
    #detail .detail-group,
    #detail .detail-group:nth-child(even),
    #detail .detail-group:last-child:nth-child(odd) {
      grid-column: auto !important;
      min-width: 0 !important;
      padding: .95rem 1rem !important;
      border: 1px solid #ded6d0 !important;
      border-radius: 0 !important;
      background: #fff !important;
    }
    #detail .detail-group:last-child:nth-child(odd) {
      grid-column: 1 / -1 !important;
    }
    #detail .detail-group h3 {
      margin: 0 0 .8rem !important;
      padding: 0 0 .55rem !important;
      border-bottom: 1px solid #eee7e2 !important;
      color: #5d142b !important;
      font-size: .92rem !important;
      font-weight: 800 !important;
    }
    #detail .detail-group dl {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 0 !important;
      margin: 0 !important;
    }
    #detail .detail-group dl > div {
      display: grid !important;
      grid-template-columns: minmax(128px, max-content) minmax(0, 1fr) !important;
      align-items: start !important;
      gap: .85rem !important;
      min-width: 0 !important;
      padding: .58rem 0 !important;
      border-bottom: 1px solid #f0ebe7 !important;
    }
    #detail .detail-group dl > div:first-child {
      padding-top: 0 !important;
    }
    #detail .detail-group dl > div:last-child {
      padding-bottom: 0 !important;
      border-bottom: 0 !important;
    }
    #detail .detail-group dt {
      display: inline-flex !important;
      width: fit-content !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: .28rem .5rem !important;
      border: 1px solid #cfc4bf !important;
      border-radius: 0 !important;
      background: #f8f6f4 !important;
      color: #5d142b !important;
      font-size: .69rem !important;
      font-weight: 800 !important;
      line-height: 1.25 !important;
      letter-spacing: .02em !important;
    }
    #detail .detail-group dd {
      min-height: 0 !important;
      margin: 0 !important;
      padding: .25rem 0 0 !important;
      border: 0 !important;
      background: transparent !important;
      color: #302a27 !important;
      font-size: .84rem !important;
      font-weight: 500 !important;
      line-height: 1.45 !important;
      overflow-wrap: anywhere !important;
    }
    #detail .technical dl > div {
      display: grid !important;
      grid-template-columns: minmax(128px, max-content) minmax(0, 1fr) !important;
      gap: .85rem !important;
      padding: .45rem 0 !important;
    }
    #detail .technical dt {
      display: inline-flex !important;
      width: fit-content !important;
      padding: .24rem .45rem !important;
      border: 1px solid #d6cdc7 !important;
      background: #fff !important;
      color: #655953 !important;
      font-size: .68rem !important;
      font-weight: 800 !important;
    }
    #detail .technical dd {
      margin: 0 !important;
      padding-top: .2rem !important;
      font-weight: 500 !important;
    }

    @media (max-width: 900px) {
      #detail .detail-sections {
        grid-template-columns: 1fr !important;
      }
      #detail .detail-group:last-child:nth-child(odd) {
        grid-column: auto !important;
      }
      #detail .detail-group dl > div,
      #detail .technical dl > div {
        grid-template-columns: 1fr !important;
        gap: .38rem !important;
      }
      #detail .detail-group dd,
      #detail .technical dd {
        padding-top: 0 !important;
      }
    }
    ` : ''}
  `;
  document.head.append(style);

  if (!isPortalRepertorio) return;

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