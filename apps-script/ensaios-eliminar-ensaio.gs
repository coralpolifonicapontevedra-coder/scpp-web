/*
 * Eliminación segura de ensaios desde o Portal SCPP.
 *
 * Require os helpers definidos en ensaios-portal.gs.
 * Borra o ensaio e, para evitar rexistros orfos, elimina tamén as filas
 * relacionadas en AsistenciasEnsaios e EnsaiosRepertorio.
 */

function eliminarEnsaioPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);
  if (!permiso.escritura) {
    return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para eliminar ensaios' };
  }

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);
  if (!idEnsaio) {
    return { ok: false, codigo: 'VALIDATION', erro: 'Falta identificar o ensaio' };
  }

  var cfg = configuracionEnsaiosPortal_();
  var ensaios = filasEnsaiosPortal_(cfg.ensaiosId, 'Ensaios');
  var filaEnsaio = ensaios.rows.find(function (row) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Ensaio', 'IdEnsaio', 'Id'])) === idEnsaio;
  });

  if (!filaEnsaio) {
    return { ok: false, codigo: 'NOT_FOUND', erro: 'Non se atopou o ensaio' };
  }

  function eliminarRelacionadas_(spreadsheetId, nomeFolla, nomesCampo) {
    var datosFolla = filasEnsaiosPortal_(spreadsheetId, nomeFolla);
    var filas = datosFolla.rows.filter(function (row) {
      return textoEnsaiosPortal_(campoEnsaiosPortal_(row, nomesCampo)) === idEnsaio;
    }).map(function (row) { return row.__row; }).sort(function (a, b) { return b - a; });

    filas.forEach(function (numeroFila) {
      datosFolla.sheet.deleteRow(numeroFila);
    });
    return filas.length;
  }

  var asistenciasEliminadas = eliminarRelacionadas_(
    cfg.asistenciasId,
    'AsistenciasEnsaios',
    ['Ensaio', 'Id_Ensaio', 'IdEnsaio']
  );

  var obrasEliminadas = eliminarRelacionadas_(
    cfg.ensaiosRepertorioId,
    'EnsaiosRepertorio',
    ['Ensaio', 'Id_Ensaio', 'IdEnsaio']
  );

  ensaios.sheet.deleteRow(filaEnsaio.__row);
  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      asistenciasEliminadas: asistenciasEliminadas,
      obrasEliminadas: obrasEliminadas,
      eliminadoPor: email
    }
  };
}
