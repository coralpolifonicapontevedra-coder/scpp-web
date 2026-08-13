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

const ENSAIOS_DRAFT_SCRIPT = '<script src="/js/ensaios-borrador-r2.js?v=20260812-2" defer></script>';
const ENSAIOS_DELETE_SCRIPT = '<script src="/js/ensaios-eliminar-ensaio.js?v=20260813-1" defer></script>';

const ENSAIOS_SIMPLE_UI = `
<style id="scpp-ensaios-simple-ui">
  #repertoire-panel .work-type,
  #repertoire-panel .work-from,
  #repertoire-panel .work-to { display:none !important; }
  #repertoire-panel .work-fields {
    display:grid !important;
    grid-template-columns:minmax(0,1fr) auto auto auto !important;
    align-items:center;
    gap:.55rem !important;
  }
  #repertoire-panel .work-notes { width:100%; min-width:0; box-sizing:border-box; }
  #repertoire-panel .work-link,
  #repertoire-panel .work-link:visited,
  #repertoire-panel .work-link:hover,
  #repertoire-panel .work-link:focus { color:#24211f !important; text-decoration:none !important; }
  #repertoire-panel .work-link { display:flex !important; flex-direction:column; gap:.42rem !important; }
  #calendar-list .delete-rehearsal {
    justify-self:end;
    margin-top:-.15rem;
    margin-bottom:.35rem;
    border:1px solid #b8aaa3;
    background:#fff;
    color:#6b201f;
    padding:.45rem .7rem;
    border-radius:3px;
    font:inherit;
    font-size:.76rem;
    font-weight:700;
    cursor:pointer;
  }
  #calendar-list .delete-rehearsal:hover,
  #calendar-list .delete-rehearsal:focus { border-color:#6b201f; background:#fbf6f5; }
  #calendar-list .delete-rehearsal:disabled { opacity:.6; cursor:wait; }
  @media(max-width:680px){
    #repertoire-panel .work-fields{grid-template-columns:1fr !important;}
    #repertoire-panel .save-work,
    #repertoire-panel .remove-work{width:100%;}
    #calendar-list .delete-rehearsal{justify-self:stretch;width:100%;}
  }
</style>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#repertoire-panel h2, [data-work="repertorio"], #program-dialog .section-kicker, #tracking-kpis span').forEach(function (node) {
      if ((node.textContent || '').trim() === 'Obras traballadas') node.textContent = 'Obras';
    });
  }, { once:true });
</script>`;

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
  if (pathname === '/portal/ensaios') extra += ENSAIOS_DRAFT_SCRIPT + ENSAIOS_DELETE_SCRIPT + ENSAIOS_SIMPLE_UI;

  return new HTMLRewriter()
    .on('head', new PortalHeadRewriter(extra))
    .transform(response);
}
