/*
 * Administración de ensaios desde o Portal SCPP.
 *
 * Este ficheiro reutiliza os helpers de apps-script/ensaios-portal.gs.
 * As operacións conservan sempre o Id_Ensaio e non eliminan relacións.
 */

function listarEnsaiosAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);
  if (!permiso.escritura) {
    return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para administrar ensaios' };
  }

  var cfg = configuracionEnsaiosPortal_();
  var ensaios = filasEnsaiosPortal_(cfg.ensaiosId, 'Ensaios').rows;
  var asistencias = filasEnsaiosPortal_(cfg.asistenciasId, 'AsistenciasEnsaios').rows;
  var repertorio = filasEnsaiosPortal_(cfg.ensaiosRepertorioId, 'EnsaiosRepertorio').rows;

  var contaAsistencias = {};
  asistencias.forEach(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Ensaio', 'Id_Ensaio', 'IdEnsaio']));
    if (id) contaAsistencias[id] = (contaAsistencias[id] || 0) + 1;
  });

  var contaRepertorio = {};
  repertorio.forEach(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Ensaio', 'Id_Ensaio', 'IdEnsaio']));
    if (id) contaRepertorio[id] = (contaRepertorio[id] || 0) + 1;
  });

  var out = ensaios.map(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Ensaio', 'IdEnsaio', 'Id']));
    return {
      idEnsaio: id,
      data: serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])),
      horaInicio: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['HoraInicio'])),
      horaFin: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['HoraFin'])),
      lugar: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Lugar'])),
      tipoEnsaio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['TipoEnsaio'])),
      descricion: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Descricion', 'Descripción'])),
      cancelado: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cancelado'])),
      asistencias: contaAsistencias[id] || 0,
      obras: contaRepertorio[id] || 0
    };
  }).filter(function (item) { return item.idEnsaio; });

  out.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });

  return {
    ok: true,
    nivel: permiso.nivel,
    ensaios: out
  };
}

function dataEnsaiosAdministracionPortal_(valor) {
  var texto = textoEnsaiosPortal_(valor);
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!match) return null;
  var data = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (
    data.getFullYear() !== Number(match[1]) ||
    data.getMonth() !== Number(match[2]) - 1 ||
    data.getDate() !== Number(match[3])
  ) return null;
  return data;
}

function actualizarEnsaioAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);
  if (!permiso.escritura) {
    return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para administrar ensaios' };
  }

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);
  var novaData = textoEnsaiosPortal_(datos && datos.data);
  var cancelar = datos && datos.cancelado === true;
  var dataValor = cancelar ? null : dataEnsaiosAdministracionPortal_(novaData);

  if (!idEnsaio) return { ok: false, codigo: 'VALIDATION', erro: 'Falta o identificador do ensaio' };
  if (!cancelar && !dataValor) {
    return { ok: false, codigo: 'VALIDATION', erro: 'A nova data do ensaio non é válida' };
  }

  var cfg = configuracionEnsaiosPortal_();
  var datosFolla = filasEnsaiosPortal_(cfg.ensaiosId, 'Ensaios');
  var headers = datosFolla.headers;
  var row = datosFolla.rows.find(function (item) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Id_Ensaio', 'IdEnsaio', 'Id'])) === idEnsaio;
  });

  if (!row) return { ok: false, codigo: 'NOT_FOUND', erro: 'Non se atopou o ensaio indicado' };

  var dataIndex = indiceHeaderEnsaiosPortal_(headers, ['Data']);
  var canceladoIndex = indiceHeaderEnsaiosPortal_(headers, ['Cancelado']);
  if (dataIndex < 0 || canceladoIndex < 0) {
    return { ok: false, codigo: 'SCHEMA', erro: 'A folla Ensaios non ten as columnas Data e Cancelado esperadas' };
  }

  if (cancelar) {
    datosFolla.sheet.getRange(row.__row, canceladoIndex + 1).setValue(true);
  } else {
    datosFolla.sheet.getRange(row.__row, dataIndex + 1).setValue(dataValor).setNumberFormat('yyyy-mm-dd');
  }
  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      data: cancelar ? serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])) : novaData,
      cancelado: cancelar,
      actualizadoPor: email
    }
  };
}
