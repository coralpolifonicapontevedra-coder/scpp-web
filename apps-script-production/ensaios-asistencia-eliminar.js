/* Eliminación individual e idempotente dunha asistencia de ensaio. */
function eliminarAsistenciaEnsaioPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);

  if (!permiso.escritura) {
    return {
      ok: false,
      codigo: 'FORBIDDEN',
      erro: 'Usuario non autorizado para eliminar asistencias'
    };
  }

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);
  var idPersoa = textoEnsaiosPortal_(datos && datos.idPersoa);

  if (!idEnsaio || !idPersoa) {
    return {
      ok: false,
      codigo: 'INVALID_DATA',
      erro: 'Falta o ensaio ou a persoa'
    };
  }

  var cfg = configuracionEnsaiosPortal_();
  var table = filasEnsaiosPortal_(cfg.asistenciasId, 'AsistenciasEnsaios');
  var fila = table.rows.find(function(row) {
    return (
      textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Ensaio'])) === idEnsaio &&
      textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Persoa'])) === idPersoa
    );
  });

  /* Idempotente: se xa se borrou manualmente na Sheet, considérase correcto. */
  if (!fila) {
    return {
      ok: true,
      resultado: {
        idEnsaio: idEnsaio,
        idPersoa: idPersoa,
        eliminado: false,
        xaNonExistia: true
      }
    };
  }

  table.sheet.deleteRow(fila.__row);
  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      idPersoa: idPersoa,
      eliminado: true,
      xaNonExistia: false
    }
  };
}
