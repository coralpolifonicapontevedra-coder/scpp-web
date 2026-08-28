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
</style>`;

const ADMIN_PHOTOS_EDITOR_SCRIPT = [
  '<link rel="stylesheet" href="/css/admin-fotografias-compactas.css?v=20260825-2">',
  '<link rel="stylesheet" href="/css/admin-fotografias-etiquetas.css?v=20260827-2">',
  '<script src="/js/admin-fotografias-editor.js?v=20260825-1"></script>',
  '<script src="/js/admin-fotografias-editor-reset.js?v=20260825-1"></script>',
  '<script src="/js/admin-fotografias-autoopen.js?v=20260825-1" defer></script>',
  '<script src="/js/admin-fotografias-filtros.js?v=20260825-1" defer></script>'
].join('');

const ADMIN_ENSAIOS_COMPAT_SCRIPT = '<script src="/js/ensaios-admin-cache-compat.js?v=20260828-1"></script>';

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
  if (pathname === '/portal/administracion/ensaios') {
    extra += ADMIN_ENSAIOS_COMPAT_SCRIPT;
  }

  return new HTMLRewriter()
    .on('head', new PortalHeadRewriter(extra))
    .transform(response);
}
