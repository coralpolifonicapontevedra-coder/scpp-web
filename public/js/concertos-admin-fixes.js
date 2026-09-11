(() => {
  const fetchBase = window.fetch.bind(window);

  const normalizar = (valor = '') => String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const eDirectora = (persoa = {}) => {
    const tipo = normalizar(persoa.tipoSocio || persoa.tipo || '');
    const cargo = normalizar(persoa.cargo || '');
    const nome = normalizar([
      persoa.nome,
      persoa.primeiroApelido,
      persoa.segundoApelido
    ].filter(Boolean).join(' '));

    if (/^director a(?: |$)/.test(tipo) || tipo === 'director' || tipo === 'directora') return true;
    if (cargo === 'director' || cargo === 'directora' || cargo.includes('direccion musical')) return true;

    // Respaldo para os borradores antigos, que non gardaban tipo de socio nin cargo.
    return nome.includes('nanette') && nome.includes('sanchez') && nome.includes('ordaz');
  };

  const urlDe = (input) => {
    try {
      const valor = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input || '');
      return new URL(valor, window.location.href);
    } catch {
      return null;
    }
  };

  const corpoJson = (init) => {
    if (!init || typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch { return null; }
  };

  const asistenciaDesdePantalla = () => Array.from(document.querySelectorAll('.attendance-person[data-person]'))
    .map((row) => {
      if (!(row instanceof HTMLElement)) return null;
      const id = String(row.dataset.person || '').trim();
      if (!id) return null;
      const seleccionado = row.querySelector('[data-attendance].is-selected');
      const estado = seleccionado instanceof HTMLButtonElement
        ? String(seleccionado.dataset.attendance || '').trim()
        : '';
      const input = row.querySelector('[data-justification]');
      return {
        id,
        estado,
        xustificacion: estado === 'xustificada' && input instanceof HTMLInputElement ? input.value.trim() : ''
      };
    })
    .filter(Boolean);

  window.fetch = async (input, init = {}) => {
    const url = urlDe(input);
    let accion = null;
    let corpo = corpoJson(init);
    let destino = input;
    let options = init;

    if (url?.pathname === '/api/concertos-admin' && corpo?.accion) {
      accion = String(corpo.accion || '').trim();

      if (accion === 'gardarAsistentes') {
        corpo = { ...corpo, persoas: asistenciaDesdePantalla() };
        options = { ...init, body: JSON.stringify(corpo) };
      }

      if (accion === 'finalizarXestion') {
        destino = '/api/concertos-admin-sync';
      }
    }

    const resposta = await fetchBase(destino, options);

    if (url?.pathname === '/api/concertos-admin' && accion === 'obterXestion' && resposta.ok) {
      const datos = await resposta.clone().json().catch(() => null);
      if (datos?.ok && Array.isArray(datos.persoas)) {
        const headers = new Headers(resposta.headers);
        headers.delete('content-length');
        headers.set('content-type', 'application/json; charset=utf-8');
        headers.set('x-scpp-concertos-directora', 'excluida-da-asistencia');
        return new Response(JSON.stringify({
          ...datos,
          persoas: datos.persoas.filter((persoa) => !eDirectora(persoa))
        }), {
          status: resposta.status,
          statusText: resposta.statusText,
          headers
        });
      }
    }

    return resposta;
  };

  document.addEventListener('click', (event) => {
    const boton = event.target instanceof Element
      ? event.target.closest('#people-list button[data-attendance]')
      : null;
    if (!(boton instanceof HTMLButtonElement) || !boton.classList.contains('is-selected')) return;

    const estadoReal = String(boton.dataset.attendance || '').trim();
    if (!estadoReal || estadoReal === '__clear__') return;

    // O xestor orixinal conserva o estado nun obxecto pechado no módulo. Facémoslle
    // rexistrar un estado neutro e, ao rematar o mesmo clic, deixamos a interface
    // realmente desmarcada. Ao gardar, o fetch reconstrúe os estados desde o DOM.
    boton.dataset.attendance = '__clear__';
    queueMicrotask(() => {
      boton.dataset.attendance = estadoReal;
      boton.classList.remove('is-selected');
      const fila = boton.closest('.attendance-person');
      const xustificacion = fila?.querySelector('.justification');
      if (xustificacion instanceof HTMLElement) xustificacion.hidden = true;
    });
  }, true);
})();
