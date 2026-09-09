const PORTAL_FONT_STYLE = `
<style id="scpp-portal-font">
  :root {
    --scpp-portal-font: 'Aptos', 'Calibri', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  body,
  .portal-shell,
  .portal-shell *,
  .portal-private-body,
  .portal-private-body * {
    font-family: var(--scpp-portal-font) !important;
  }

  .portal-intro h1,
  .portal-access-card h2,
  .privacy-dialog h2 {
    font-family: var(--scpp-portal-font) !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em !important;
  }

  /*
   * Estabilización visual do inicio do Portal.
   *
   * A tarxeta de acceso cámbiase de posición mediante JavaScript para adaptar
   * a orde en pantallas medias e pequenas. Facemos que a disposición final
   * exista xa no primeiro pintado para evitar saltos de layout (CLS) cando o
   * script reubica a tarxeta e aplica os seus estilos responsivos.
   */
  body.portal-private-body #portal-shell:not(.private-active) .portal-hero {
    grid-template-areas:
      'intro access'
      'features access' !important;
    row-gap: 0 !important;
  }

  body.portal-private-body #portal-shell:not(.private-active) .portal-intro {
    display: contents !important;
  }

  body.portal-private-body #portal-shell:not(.private-active) .portal-heading {
    grid-area: intro;
    width: 100%;
    max-width: 960px;
  }

  body.portal-private-body #portal-shell:not(.private-active) .portal-feature-grid {
    grid-area: features;
    width: 100%;
    max-width: 960px;
  }

  body.portal-private-body #portal-shell:not(.private-active) .portal-access-card {
    grid-area: access;
  }

  body.portal-private-body .portal-feature {
    grid-template-rows: auto minmax(0, 1fr) auto !important;
  }

  body.portal-private-body .portal-feature > span {
    grid-column: 1 !important;
    grid-row: 1 / span 3 !important;
  }

  body.portal-private-body .portal-feature > strong {
    grid-column: 2 !important;
    grid-row: 1 !important;
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
  }

  body.portal-private-body .portal-feature > p {
    grid-column: 2 !important;
    grid-row: 2 !important;
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
  }

  body.portal-private-body .portal-feature > em {
    grid-column: 2 !important;
    grid-row: 3 !important;
  }

  body.portal-private-body .portal-feature > b {
    grid-column: 3 !important;
    grid-row: 1 / span 3 !important;
  }

  @media (max-width: 1320px) {
    body.portal-private-body #portal-shell:not(.private-active) .portal-hero {
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-areas:
        'intro'
        'access'
        'features' !important;
      column-gap: 0 !important;
      row-gap: 0 !important;
    }

    body.portal-private-body #portal-shell:not(.private-active) .portal-heading,
    body.portal-private-body #portal-shell:not(.private-active) .portal-feature-grid {
      max-width: none;
    }

    body.portal-private-body #portal-shell:not(.private-active) .portal-access-card {
      width: 100% !important;
      max-width: none !important;
      margin: 0 0 1.25rem !important;
      padding: 1.25rem 1.4rem !important;
      justify-self: stretch !important;
      box-shadow: 0 12px 32px rgba(42, 32, 26, .07) !important;
    }

    body.portal-private-body #portal-shell:not(.private-active) .portal-access-card h2 {
      margin-bottom: .55rem !important;
      font-size: clamp(1.45rem, 3vw, 1.8rem) !important;
    }

    body.portal-private-body #portal-shell:not(.private-active) .portal-access-card p {
      margin-top: .35rem !important;
      margin-bottom: .8rem !important;
    }

    body.portal-private-body #portal-shell:not(.private-active) .portal-access-card button,
    body.portal-private-body #portal-shell:not(.private-active) .portal-access-card input[type='email'] {
      min-height: 44px !important;
    }

    body.portal-private-body #portal-shell:not(.private-active) .portal-access-card footer {
      margin-top: 1.1rem !important;
      padding-top: .85rem !important;
    }
  }
</style>`;

const ADMIN_PHOTOS_EDITOR_SCRIPT = [
  '<link rel="stylesheet" href="/css/admin-fotografias-compactas.css?v=20260825-2">',
  '<link rel="stylesheet" href="/css/admin-fotografias-etiquetas.css?v=20260827-2">',
  '<script src="/js/admin-fotografias-editor.js?v=20260825-1"></script>',
  '<script src="/js/admin-fotografias-fallback.js?v=20260827-1"></script>',
  '<script src="/js/admin-fotografias-editor-reset.js?v=20260825-1"></script>',
  '<script src="/js/admin-fotografias-autoopen.js?v=20260825-1" defer></script>',
  '<script src="/js/admin-fotografias-filtros.js?v=20260825-1" defer></script>'
].join('');

class PortalHeadRewriter {
  constructor(extra = '') { this.extra = extra; }
  element(element) {
    element.append(PORTAL_FONT_STYLE + this.extra, { html: true });
  }
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const pathname = new URL(context.request.url).pathname.replace(/\/+$/, '');
  let extra = '';
  if (pathname === '/portal/administracion/fotografias') {
    extra += ADMIN_PHOTOS_EDITOR_SCRIPT;
  }

  return new HTMLRewriter()
    .on('head', new PortalHeadRewriter(extra))
    .transform(response);
}
