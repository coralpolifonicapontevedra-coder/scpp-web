/* Eliminación completa de ensaios desde Administración do Portal SCPP. */

function eliminarEnsaioPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosAdministracionPortal_(email);
  if (!permiso.escritura) {
    return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para eliminar ensaios' };
  }

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);
  if (!idEnsaio) {
    return { ok:false, codigo:'VALIDATION', erro:'Falta o identificador do ensaio' };
  }

  var cfg = configuracionEnsaiosAdministracionPortal_();
  var ensaios = filasEnsaiosAdministracionPortal_(cfg.ensaiosId, 'Ensaios', 'ENSAIOS_SPREADSHEET_ID');
  var asistencias = filasEnsaiosAdministracionPortal_(cfg.asistenciasId, 'AsistenciasEnsaios', 'ASISTENCIAS_ENSAIOS_SPREADSHEET_ID');
  var repertorio = filasEnsaiosAdministracionPortal_(cfg.ensaiosRepertorioId, 'EnsaiosRepertorio', 'ENSAIOS_REPERTORIO_SPREADSHEET_ID');

  var ensaio = ensaios.rows.find(function (row) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Ensaio','IdEnsaio','Id'])) === idEnsaio;
  });
  if (!ensaio) {
    return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou o ensaio indicado' };
  }

  function filasRelacionadas(table, nomesCampo) {
    return table.rows
      .filter(function (row) {
        return textoEnsaiosPortal_(campoEnsaiosPortal_(row, nomesCampo)) === idEnsaio;
      })
      .map(function (row) { return row.__row; })
      .sort(function (a, b) { return b - a; });
  }

  var filasAsistencias = filasRelacionadas(asistencias, ['Ensaio','Id_Ensaio','IdEnsaio']);
  var filasRepertorio = filasRelacionadas(repertorio, ['Ensaio','Id_Ensaio','IdEnsaio']);

  try {
    filasAsistencias.forEach(function (rowNumber) {
      asistencias.sheet.deleteRow(rowNumber);
    });
    filasRepertorio.forEach(function (rowNumber) {
      repertorio.sheet.deleteRow(rowNumber);
    });
    ensaios.sheet.deleteRow(ensaio.__row);
    SpreadsheetApp.flush();
  } catch (erro) {
    throw new Error(
      'Non se puido eliminar o ensaio e as súas relacións. ' +
      String(erro && erro.message ? erro.message : erro)
    );
  }

  return {
    ok:true,
    resultado:{
      idEnsaio:idEnsaio,
      asistenciasEliminadas:filasAsistencias.length,
      obrasEliminadas:filasRepertorio.length,
      eliminadoPor:email
    }
  };
}
