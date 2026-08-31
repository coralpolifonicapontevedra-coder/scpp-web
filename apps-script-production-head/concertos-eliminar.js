/* Eliminación completa de concertos desde Administración. */

function eliminarFilasConcertoAdministracionPortal_(datosFolla, idConcerto, aliases) {
  var eliminadas = 0;
  for (var i = datosFolla.rows.length - 1; i >= 0; i--) {
    var row = datosFolla.rows[i];
    var valor = textoEnsaiosPortal_(campoEnsaiosPortal_(row, aliases));
    if (valor !== idConcerto) continue;
    datosFolla.sheet.deleteRow(row.__row);
    eliminadas++;
  }
  return eliminadas;
}

function eliminarConcertoAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) {
    return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para administrar concertos' };
  }

  var id = textoEnsaiosPortal_(datos && datos.idConcerto);
  if (!id) return { ok:false, codigo:'VALIDATION', erro:'Falta identificar o concerto' };
  if (id.indexOf('hist-') === 0) {
    return { ok:false, codigo:'HISTORICO_PROTEXIDO', erro:'Os concertos históricos non se poden eliminar desde Administración' };
  }

  var cfg = configuracionConcertosAdministracionPortal_();
  var concertos = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID');
  var rowConcerto = concertos.rows.find(function (row) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id','Id_Concerto','IdConcerto'])) === id;
  });
  if (!rowConcerto) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou o concerto indicado' };

  var programa = filasEnsaiosAdministracionPortal_(cfg.concertosRepertorioId, 'ConcertosRepertorio', 'CONCERTOS_REPERTORIO_SPREADSHEET_ID');
  var asistencias = filasEnsaiosAdministracionPortal_(cfg.asistenciasId, 'AsistenciasConcertos', 'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID');

  var programaEliminado = eliminarFilasConcertoAdministracionPortal_(
    programa,
    id,
    ['Id_Conciertos','Concerto','IdConcerto']
  );
  var asistenciasEliminadas = eliminarFilasConcertoAdministracionPortal_(
    asistencias,
    id,
    ['Concerto','Id_Conciertos','IdConcerto']
  );

  concertos.sheet.deleteRow(rowConcerto.__row);
  SpreadsheetApp.flush();

  return {
    ok:true,
    resultado:{
      idConcerto:id,
      concertoEliminado:true,
      obrasEliminadas:programaEliminado,
      asistenciasEliminadas:asistenciasEliminadas,
      eliminadoPor:email
    }
  };
}
