(() => {
  const STORAGE_KEY = 'scpp-ultimo-erro-auth';
  let ultimoCodigo = '';

  const obterCodigo = (valor) => {
    if (!valor) return '';

    if (typeof valor === 'object' && typeof valor.code === 'string') {
      return valor.code.trim();
    }

    const texto =
      typeof valor === 'string'
        ? valor
        : typeof valor?.message === 'string'
          ? valor.message
          : String(valor);

    const coincidencia = texto.match(/auth\/[a-z0-9-]+/i);
    return coincidencia ? coincidencia[0] : '';
  };

  const consoleErrorOrixinal = console.error.bind(console);

  console.error = (...argumentos) => {
    try {
      for (const argumento of argumentos) {
        const codigo = obterCodigo(argumento);
        if (!codigo) continue;

        ultimoCodigo = codigo;
        window.sessionStorage.setItem(STORAGE_KEY, codigo);
        break;
      }
    } catch {
      // O diagnóstico nunca debe interromper o funcionamento do portal.
    }

    consoleErrorOrixinal(...argumentos);
  };

  const completarMensaxe = () => {
    const mensaxe = document.querySelector('#portal-message');
    if (!(mensaxe instanceof HTMLElement)) return;

    const observador = new MutationObserver(() => {
      const texto = mensaxe.textContent?.trim() || '';
      const eErroGoogle = texto === 'Non foi posible completar o acceso con Google.';
      const eErroLigazon = texto === 'A ligazón non é válida ou xa caducou. Solicita unha nova.';

      if (!eErroGoogle && !eErroLigazon) return;

      const codigo =
        ultimoCodigo ||
        window.sessionStorage.getItem(STORAGE_KEY) ||
        '';

      if (!codigo || texto.includes('Código técnico:')) return;

      mensaxe.textContent = `${texto} Código técnico: ${codigo}.`;
    });

    observador.observe(mensaxe, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  const adaptarOrdeAcceso = () => {
    const portalHero = document.querySelector('.portal-hero');
    const portalIntro = document.querySelector('.portal-intro');
    const accessCard = document.querySelector('.portal-access-card');
    const featureGrid = document.querySelector('#portal-feature-grid');

    if (
      !(portalHero instanceof HTMLElement) ||
      !(portalIntro instanceof HTMLElement) ||
      !(accessCard instanceof HTMLElement) ||
      !(featureGrid instanceof HTMLElement)
    ) return;

    const media = window.matchMedia('(max-width: 1320px)');

    const aplicar = () => {
      if (media.matches) {
        if (accessCard.parentElement !== portalIntro) {
          portalIntro.insertBefore(accessCard, featureGrid);
        }
      } else if (accessCard.parentElement !== portalHero) {
        portalHero.append(accessCard);
      }
    };

    if (!document.querySelector('#portal-access-responsive-styles')) {
      const style = document.createElement('style');
      style.id = 'portal-access-responsive-styles';
      style.textContent = `
        @media (max-width: 1320px) {
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
      `;
      document.head.append(style);
    }

    aplicar();
    media.addEventListener?.('change', aplicar);
  };

  const iniciar = () => {
    completarMensaxe();
    adaptarOrdeAcceso();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
