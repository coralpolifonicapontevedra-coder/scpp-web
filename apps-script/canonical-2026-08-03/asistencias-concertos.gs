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
    const estado = String(asistencia.EstadoAsistencia || asistencia['Estado asistencia'] || '').trim().toLowerCase();
    if (estado && !['asiste', 'true', '1', 'si', 'sí', 'yes', 'x'].includes(estado)) return;
    const idConcerto = String(asistencia.Concerto || '').trim();
    const nome = String(
      asistencia.Nome_Completo ||
      asistencia['Nome e apelidos'] ||
      ''
    ).trim();
    const voz = String(asistencia.Voz || 'Sen voz indicada').trim();

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
  const folla = SpreadsheetApp
    .openById('1pObayoj3uoPLtqUqQG9S5GZ0afRz9ErBeJbTgJlaiH0')
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
