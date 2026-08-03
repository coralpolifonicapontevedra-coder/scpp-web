(() => {
  'use strict';

  const fetchOriginal = window.fetch.bind(window);
  const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function ePeticionAsistencias(input, init) {
    const url = typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : String(input || '');

    if (!url.includes('/api/repertorio')) return false;
    if (!init || typeof init.body !== 'string') return false;

    try {
      const corpo = JSON.parse(init.body);
      return corpo?.accion === 'listarAsistenciasConcertosPortal';
    } catch {
      return false;
    }
  }

  window.fetch = async (input, init) => {
    if (!ePeticionAsistencias(input, init)) {
      return fetchOriginal(input, init);
    }

    let corpo;
    try {
      corpo = JSON.parse(init.body);
    } catch {
      corpo = {};
    }

    const novoInit = {
      ...init,
      body: JSON.stringify({ idToken: String(corpo.idToken || '') }),
      cache: 'no-store'
    };

    let ultimaResposta = null;
    let ultimoErro = null;
    const esperas = [0, 900, 2200];

    for (let intento = 0; intento < esperas.length; intento += 1) {
      if (esperas[intento]) await esperar(esperas[intento]);

      try {
        const resposta = await fetchOriginal('/api/asistencias-concertos', {
          ...novoInit,
          headers: {
            ...(novoInit.headers || {}),
            'Content-Type': 'application/json',
            'X-SCPP-Retry': String(intento + 1)
          }
        });
        ultimaResposta = resposta;

        if (resposta.ok) return resposta;
        if (![502, 503, 504].includes(resposta.status)) return resposta;
      } catch (erro) {
        ultimoErro = erro;
      }
    }

    if (ultimaResposta) return ultimaResposta;
    throw ultimoErro || new Error('Non foi posible consultar as asistencias.');
  };
})();
