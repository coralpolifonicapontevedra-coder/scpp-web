(() => {
  const aplicar = () => {
    if (!/^\/(?:es\/)?historia\/?$/.test(window.location.pathname)) return;

    const sanDavid = document.querySelector('.castelao-san-david-block .castelao-hero-image img');
    if (sanDavid instanceof HTMLImageElement) {
      sanDavid.src = '/images/castelao/escudo-san-david.svg';
    }

    const roseton = document.querySelector('.castelao-roseton-block .castelao-hero-image img');
    if (roseton instanceof HTMLImageElement) {
      roseton.src = '/api/galeria-orixinal?ruta=fotos%2Forixinais%2F91630e1a-725d-42c9-9aa5-259e6655ef08.jpg';
    }

    if (window.location.pathname.startsWith('/es/')) {
      const rosetonTitle = document.querySelector('.castelao-roseton-block h3');
      if (rosetonTitle) rosetonTitle.textContent = 'Rosetón oxival';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicar, { once: true });
  } else {
    aplicar();
  }
})();
