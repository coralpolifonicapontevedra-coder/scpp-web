/*
 * Administración de ensaios desde o Portal SCPP.
 *
 * Este ficheiro reutiliza só helpers xenéricos de apps-script/ensaios-portal.gs.
 * As operacións conservan sempre o Id_Ensaio e non eliminan relacións.
 *
 * En test, a autorización queda limitada a WEB_TEST_EMAIL e os datos dependen
 * exclusivamente das tres copias Preview de Ensaios.
 */

function configuracionEnsaiosAdministracionPortal_() {
  var props = PropertiesService.getScriptProperties();
  var nomes = [
    'ENSAIOS_SPREADSHEET_ID',
    'ASISTENCIAS_ENSAIOS_SPREADSHEET_ID',
    'ENSAIOS_REPERTORIO_SPREADSHEET_ID'
  ];
  var valores = {};

  nomes.forEach(function (nome) {
    var valor = String(props.getProperty(nome) || '').trim();
    if (!valor) {
      throw new Error('Falta a propiedade obrigatoria do ambiente: ' + nome);
    }
    valores[nome] = valor;
  });

  return {
    ensaiosId: valores.ENSAIOS_SPREADSHEET_ID,
    asistenciasId: valores.ASISTENCIAS_ENSAIOS_SPREADSHEET_ID,
    ensaiosRepertorioId: valores.ENSAIOS_REPERTORIO_SPREADSHEET_ID
  };
}

function permisoEnsaiosAdministracionPortal_(email) {
  var props = PropertiesService.getScriptProperties();
  var ambiente = String(props.getProperty('SCPP_ENVIRONMENT') || '').trim().toLowerCase();
  var correo = String(email || '').trim().toLowerCase();

  if (ambiente === 'test') {
    var correoProba = String(props.getProperty('WEB_TEST_EMAIL') || '').trim().toLowerCase();
    var autorizado = !!correo && !!correoProba && correo === correoProba;
    return {
      autorizado: autorizado,
      escritura: autorizado,
      nivel: autorizado ? 'Administración' : ''
    };
  }

  return permisoEnsaiosPortal_(correo);
}

function listarEnsaiosAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosAdministracionPortal_(email);
  if (!permiso.escritura) {
    return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para administrar ensaios' };
  }

  var cfg = configuracionEnsaiosAdministracionPortal_();
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
  var permiso = permisoEnsaiosAdministracionPortal_(email);
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

  var cfg = configuracionEnsaiosAdministracionPortal_();
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
