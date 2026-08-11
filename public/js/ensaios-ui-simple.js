(() => {
  'use strict';
  if (!window.location.pathname.startsWith('/portal/ensaios')) return;

  const style = document.createElement('style');
  style.textContent = `
    #repertoire-panel .work-type,
    #repertoire-panel .work-from,
    #repertoire-panel .work-to { display:none !important; }

    #repertoire-panel .work-fields {
      display:grid !important;
      grid-template-columns:minmax(0,1fr) auto auto auto !important;
      align-items:center;
      gap:.55rem !important;
    }

    #repertoire-panel .work-notes {
      width:100%;
      min-width:0;
      box-sizing:border-box;
    }

    #repertoire-panel .work-link,
    #repertoire-panel .work-link:visited,
    #repertoire-panel .work-link:hover,
    #repertoire-panel .work-link:focus {
      color:#24211f !important;
      text-decoration:none !important;
    }

    #repertoire-panel .work-link {
      display:flex !important;
      flex-direction:column;
      gap:.42rem !important;
    }

    @media(max-width:680px){
      #repertoire-panel .work-fields{grid-template-columns:1fr !important;}
      #repertoire-panel .save-work,
      #repertoire-panel .remove-work{width:100%;}
    }
  `;
  document.head.append(style);

  function rename() {
    document.querySelectorAll('#repertoire-panel h2, [data-work="repertorio"], #program-dialog .section-kicker').forEach((node) => {
      if (node.textContent?.trim() === 'Obras traballadas') node.textContent = 'Obras';
    });
    const summary = document.querySelector('#repertoire-summary');
    if (summary?.textContent) summary.textContent = summary.textContent.replace(/\s+traballadas?$/i, ' obras');
    document.querySelectorAll('#tracking-kpis span').forEach((node) => {
      if (node.textContent?.trim() === 'Obras traballadas') node.textContent = 'Obras';
    });
  }

  const observer = new MutationObserver(rename);
  observer.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
  rename();
})();
