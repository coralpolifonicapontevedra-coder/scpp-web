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

const PHOTO_MANAGER_SCRIPT = [
  '<script src="/js/xestor-fotos-publicacion.js?v=20260805-4" defer></script>',
  '<script src="/js/xestor-fotos-metadatos.js?v=20260805-4" defer></script>',
  '<script src="/js/borrador-fotos-pendente.js?v=20260805-4" defer></script>',
  '<script src="/js/renovar-borrador-foto.js?v=20260805-4" defer></script>'
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
  if (pathname === '/portal/revision-fotos') extra += PHOTO_MANAGER_SCRIPT;

  return new HTMLRewriter()
    .on('head', new PortalHeadRewriter(extra))
    .transform(response);
}
