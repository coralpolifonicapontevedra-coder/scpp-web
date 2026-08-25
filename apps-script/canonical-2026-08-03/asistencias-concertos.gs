/**
 * Asistencias dos concertos no Portal do Coralista.
 */
function listarAsistenciasConcertosPortal_(datos) {
  datos = datos || {};

  const correo = String(datos.email || '').trim().toLowerCase();
  const usuario = obterUsuarioWebPorEmail(correo);

  if (!usuario) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  const asistencias = lerFollaAsistenciasConcertos_();
  const ordeVoces = { Soprano: 1, Contralto: 2, Tenor: 3, Baixo: 4 };
  const porConcerto = {};

  asistencias.forEach(function(asistencia) {
    const estadoAsistencia = String(asistencia.EstadoAsistencia || asistencia['Estado asistencia'] || '').trim().toLowerCase();
    // Aceptar varias formas de indicar asistencia ('asiste', 'true', '1', 'si', 'sí', 'yes', 'x')
    if (estadoAsistencia && !['asiste', 'true', '1', 'si', 'sí', 'yes', 'x'].includes(estadoAsistencia)) return;
    const idConcerto = String(asistencia.Concerto || '').trim();
    const nome = String(
      asistencia.Nome_Completo ||
      asistencia['Nome e apelidos'] ||
      ''
    ).trim();
    const voz = String(asistencia.Voz || 'Sen voz indicada').trim();

    // Compatibilidade cos rexistros históricos: antes de existir EstadoAsistencia,
    // unha fila con concerto e persoa representaba sempre unha asistencia real.
    if (!idConcerto || !nome) return;
    if (!porConcerto[idConcerto]) porConcerto[idConcerto] = [];

    const repetida = porConcerto[idConcerto].some(function(persoa) {
      return persoa.nome === nome && persoa.voz === voz;
    });

    if (!repetida) porConcerto[idConcerto].push({ nome: nome, voz: voz });
  });

  Object.keys(porConcerto).forEach(function(idConcerto) {
    porConcerto[idConcerto].sort(function(a, b) {
      const diferenzaVoz =
        (ordeVoces[a.voz] || 99) - (ordeVoces[b.voz] || 99);

      if (diferenzaVoz !== 0) return diferenzaVoz;

      return a.nome.localeCompare(
        b.nome,
        'gl',
        { sensitivity: 'base' }
      );
    });
  });

  return {
    ok: true,
    asistenciasPorConcerto: porConcerto
  };
}

function lerFollaAsistenciasConcertos_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = String(
    props.getProperty('ASISTENCIAS_CONCERTOS_SPREADSHEET_ID') || ''
  ).trim();

  if (!spreadsheetId) {
    throw new Error('Falta a propiedade ASISTENCIAS_CONCERTOS_SPREADSHEET_ID');
  }

  const folla = SpreadsheetApp
    .openById(spreadsheetId)
    .getSheetByName('AsistenciasConcertos');

  if (!folla) {
    throw new Error('Non se atopou a folla AsistenciasConcertos');
  }

  const valores = folla.getDataRange().getDisplayValues();

  if (valores.length < 2) return [];

  const cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });

  return valores
    .slice(1)
    .filter(function(fila) {
      return fila.some(function(valor) {
        return String(valor || '').trim();
      });
    })
    .map(function(fila) {
      const rexistro = {};
      cabeceiras.forEach(function(cabeceira, indice) {
        rexistro[cabeceira] =
          fila[indice] === undefined ? '' : fila[indice];
      });
      return rexistro;
    });
}
