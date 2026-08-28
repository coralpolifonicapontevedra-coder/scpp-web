(() => {
  const panel = document.querySelector('#panel-historico');
  if (!(panel instanceof HTMLElement)) return;

  panel.innerHTML = `
    <header class="section-heading history-inline-heading">
      <p class="section-kicker">Archivo histórico</p>
      <h2>Histórico de conciertos</h2>
      <p>Consulta por décadas los conciertos documentados desde 1925, con una lectura directa y sin pasos intermedios.</p>
      <div id="history-summary" class="history-summary-badge" aria-live="polite">Cargando el archivo…</div>
      <div class="history-actions-row">
        <button id="show-all-history" type="button" class="btn-history">Ver todo el histórico</button>
        <a href="/arquivos/publico/documentos/concertos_scpp_1925_2026.pdf" download="concertos_scpp_1925_2026.pdf" class="btn-history">Descargar histórico (.pdf)</a>
      </div>
    </header>

    <div class="history-toolbar-container">
      <label class="history-search-label">
        <span class="sr-only">Buscar en el histórico</span>
        <input id="history-search" type="search" placeholder="Buscar año, número, concierto, ciudad o lugar" autocomplete="off" class="history-search-input" />
      </label>
    </div>

    <div id="history-years" class="history-inline-years"></div>
    <p id="history-empty" class="history-inline-state" hidden>No hay conciertos que coincidan con la búsqueda.</p>
    <p id="history-error" class="history-inline-state error" hidden>No ha sido posible cargar el histórico. Inténtalo de nuevo en unos instantes.</p>
  `;

  const endpoint = '/api/concertos-historico';
  const years = panel.querySelector('#history-years');
  const summary = panel.querySelector('#history-summary');
  const search = panel.querySelector('#history-search');
  const empty = panel.querySelector('#history-empty');
  const errorState = panel.querySelector('#history-error');
  const showAll = panel.querySelector('#show-all-history');
  let conciertos = [];

  const normalizar = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const escapar = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const primero = (objeto, claves, fallback = '') => {
    for (const clave of claves) {
      const valor = String(objeto?.[clave] ?? '').trim();
      if (valor) return valor;
    }
    return String(fallback ?? '').trim();
  };

  const traducirFechaHistorica = (texto = '') => String(texto)
    .replace(/\bxaneiro\b/gi, 'enero')
    .replace(/\bfebreiro\b/gi, 'febrero')
    .replace(/\bmaio\b/gi, 'mayo')
    .replace(/\bxuño\b/gi, 'junio')
    .replace(/\bxullo\b/gi, 'julio')
    .replace(/\bsetembro\b/gi, 'septiembre')
    .replace(/\boutubro\b/gi, 'octubre')
    .replace(/\bnovembro\b/gi, 'noviembre')
    .replace(/\bdecembro\b/gi, 'diciembre')
    .replace(/\bVenres Santo\b/gi, 'Viernes Santo')
    .replace(/\bXoves Santo\b/gi, 'Jueves Santo');

  const fechaConcierto = (concierto) => {
    const textoEs = primero(concierto, ['dataTextoHistoricaEs', 'fechaTextoHistorica', 'DataTextoHistorica_ES']);
    if (textoEs) return textoEs;
    if (concierto.data) {
      const fecha = new Date(`${concierto.data}T12:00:00`);
      if (!Number.isNaN(fecha.getTime())) {
        return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);
      }
    }
    const textoHistorico = primero(concierto, ['dataTextoHistorica']);
    return textoHistorico ? traducirFechaHistorica(textoHistorico) : 'Fecha no documentada';
  };

  const inicioPeriodo = (ano) => 1925 + Math.floor((Number(ano) - 1925) / 10) * 10;
  const etiquetaPeriodo = (inicio) => `${inicio}–${Math.min(inicio + 9, 2026)}`;

  const nombreConcierto = (concierto) => primero(
    concierto,
    ['nomeEs', 'nombreEs', 'Nome_ES', 'Nombre_ES'],
    concierto.nome || concierto.nombre || ''
  );

  const nombreGenerico = (concierto) => {
    const nombre = normalizar(nombreConcierto(concierto)).replaceAll(' ', '');
    const numero = normalizar(concierto.numeroConcerto).replaceAll(' ', '');
    return nombre === `concierto nº ${numero}`.replaceAll(' ', '')
      || nombre === `concerto nº ${numero}`.replaceAll(' ', '')
      || nombre === `concerto n.º ${numero}`.replaceAll(' ', '')
      || nombre === `concierto numero ${numero}`.replaceAll(' ', '');
  };

  const descripcionConcierto = (concierto) => primero(
    concierto,
    ['descricionEs', 'descripcionEs', 'Descricion_ES', 'Descripcion_ES'],
    concierto.descricion || concierto.descripcion || (nombreGenerico(concierto) ? '' : nombreConcierto(concierto)) || 'Sin descripción documentada'
  );

  const localidadConcierto = (concierto) => primero(concierto, ['cidadeEs', 'ciudadEs', 'Cidade_ES', 'Ciudad_ES'], concierto.cidade || concierto.ciudad || '—');
  const lugarConcierto = (concierto) => primero(concierto, ['lugarEs', 'Lugar_ES'], concierto.lugar || '—');

  function dibujar() {
    if (!(years instanceof HTMLElement)) return;
    const query = normalizar(search instanceof HTMLInputElement ? search.value : '');
    const exactYear = /^\d{4}$/.test(query);
    const filtrados = conciertos.filter((concierto) => {
      if (exactYear) return String(concierto.ano || '') === query;
      return !query || normalizar([
        concierto.ano,
        concierto.numeroConcerto,
        concierto.data,
        concierto.dataTextoHistorica,
        nombreConcierto(concierto),
        localidadConcierto(concierto),
        lugarConcierto(concierto),
        descripcionConcierto(concierto)
      ].join(' ')).includes(query);
    });

    const agrupados = new Map();
    filtrados.forEach((concierto) => {
      const ano = Number(concierto.ano);
      const periodo = Number.isFinite(ano) ? inicioPeriodo(ano) : 'Sin fecha';
      if (!agrupados.has(periodo)) agrupados.set(periodo, []);
      agrupados.get(periodo).push(concierto);
    });

    const periodos = Array.from(agrupados.keys()).sort((a, b) => {
      if (a === 'Sin fecha') return 1;
      if (b === 'Sin fecha') return -1;
      return Number(a) - Number(b);
    });

    const abierto = query.length > 0 ? 'open' : '';
    years.innerHTML = periodos.map((periodo) => {
      const items = agrupados.get(periodo).sort(
        (a, b) => (Number(a.ordeHistorica) || 0) - (Number(b.ordeHistorica) || 0)
      );
      const etiqueta = periodo === 'Sin fecha' ? periodo : `Década de ${etiquetaPeriodo(periodo)}`;
      return `<details class="history-inline-card" ${abierto}>
        <summary>
          <div>
            <span class="history-inline-period-label">Período histórico</span>
            <strong>${escapar(etiqueta)}</strong>
          </div>
          <div class="history-inline-period-meta">
            <span>${items.length} concierto${items.length === 1 ? '' : 's'}</span>
            <b aria-hidden="true">▼</b>
          </div>
        </summary>
        <div class="history-inline-table-wrap">
          <table>
            <thead><tr><th>Nº</th><th>Fecha</th><th>Localidad</th><th>Lugar</th><th>Descripción</th></tr></thead>
            <tbody>${items.map((concierto) => `<tr>
              <td data-label="Nº" class="number">${escapar(concierto.numeroConcerto || '—')}</td>
              <td data-label="Fecha">${escapar(fechaConcierto(concierto))}</td>
              <td data-label="Localidad">${escapar(localidadConcierto(concierto))}</td>
              <td data-label="Lugar"><strong>${escapar(lugarConcierto(concierto))}</strong></td>
              <td data-label="Descripción">${escapar(descripcionConcierto(concierto))}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </details>`;
    }).join('');

    if (summary instanceof HTMLElement) {
      summary.textContent = `${filtrados.length} concierto${filtrados.length === 1 ? '' : 's'} documentado${filtrados.length === 1 ? '' : 's'} · ${periodos.length} ${periodos.length === 1 ? 'década' : 'décadas'}`;
    }
    if (empty instanceof HTMLElement) empty.hidden = filtrados.length > 0;
  }

  async function cargar() {
    try {
      const respuesta = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const datos = await respuesta.json();
      if (!datos?.ok || !Array.isArray(datos.concertos)) throw new Error('Índice no válido');
      conciertos = datos.concertos;
      dibujar();
    } catch (error) {
      console.error('No se pudo cargar el histórico integrado:', error);
      if (summary instanceof HTMLElement) summary.textContent = 'Archivo temporalmente no disponible';
      if (errorState instanceof HTMLElement) errorState.hidden = false;
    }
  }

  search?.addEventListener('input', dibujar);
  showAll?.addEventListener('click', () => {
    if (search instanceof HTMLInputElement) search.value = '';
    dibujar();
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  cargar();
})();
