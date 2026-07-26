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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', completarMensaxe, { once: true });
  } else {
    completarMensaxe();
  }
})();
