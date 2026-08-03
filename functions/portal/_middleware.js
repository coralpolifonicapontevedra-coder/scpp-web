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

class PortalHeadRewriter {
  element(element) {
    element.append(PORTAL_FONT_STYLE, { html: true });
  }
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';

  if (!contentType.includes('text/html')) return response;

  return new HTMLRewriter()
    .on('head', new PortalHeadRewriter())
    .transform(response);
}
