/* Administración de concertos desde o Portal SCPP. */

function configuracionConcertosAdministracionPortal_() {
  var props = PropertiesService.getScriptProperties();
  var nomes = [
    'CONCERTOS_SPREADSHEET_ID',
    'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID',
    'CONCERTOS_REPERTORIO_SPREADSHEET_ID',
    'CONCERTOS_PERSOAS_SPREADSHEET_ID'
  ];
  var valores = {};
  nomes.forEach(function (nome) {
    var valor = String(props.getProperty(nome) || '').trim();
    if (!valor) throw new Error('Falta a propiedade obrigatoria do ambiente: ' + nome);
    valores[nome] = valor;
  });
  return {
    concertosId: valores.CONCERTOS_SPREADSHEET_ID,
    asistenciasId: valores.ASISTENCIAS_CONCERTOS_SPREADSHEET_ID,
    concertosRepertorioId: valores.CONCERTOS_REPERTORIO_SPREADSHEET_ID,
    persoasId: valores.CONCERTOS_PERSOAS_SPREADSHEET_ID
  };
}

function permisoConcertosAdministracionPortal_(email) {
  return permisoEnsaiosAdministracionPortal_(email);
}

function listarConcertosAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para administrar concertos' };

  var cfg = configuracionConcertosAdministracionPortal_();
  var concertos = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID').rows;
  var asistencias = filasEnsaiosAdministracionPortal_(cfg.asistenciasId, 'AsistenciasConcertos', 'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID').rows;
  var repertorio = filasEnsaiosAdministracionPortal_(cfg.concertosRepertorioId, 'ConcertosRepertorio', 'CONCERTOS_REPERTORIO_SPREADSHEET_ID').rows;

  var contaAsistencias = {};
  asistencias.forEach(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Concerto', 'Id_Conciertos', 'IdConcerto']));
    if (id) contaAsistencias[id] = (contaAsistencias[id] || 0) + 1;
  });

  var contaRepertorio = {};
  repertorio.forEach(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Conciertos', 'Concerto', 'IdConcerto']));
    if (id) contaRepertorio[id] = (contaRepertorio[id] || 0) + 1;
  });

  var out = concertos.map(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Concerto', 'IdConcerto']));
    return {
      idConcerto: id,
      data: serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])),
      nome: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Nome'])),
      cidade: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cidade'])),
      lugar: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Lugar'])),
      hora: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['Hora'])),
      estado: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Estado'])),
      mostrarWeb: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Mostrar_Web', 'MostrarWeb'])),
      destacadoWeb: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Destacado_Web', 'DestacadoWeb'])),
      asistencias: contaAsistencias[id] || 0,
      obras: contaRepertorio[id] || 0
    };
  }).filter(function (item) { return item.idConcerto; });

  out.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
  return { ok:true, nivel:permiso.nivel, concertos:out };
}

function actualizarConcertoAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para administrar concertos' };

  var idConcerto = textoEnsaiosPortal_(datos && datos.idConcerto);
  var novaData = textoEnsaiosPortal_(datos && datos.data);
  var novoEstado = textoEnsaiosPortal_(datos && datos.estado);
  var estadosValidos = ['Previsto', 'Confirmado', 'Aprazado', 'Cancelado', 'Realizado'];
  var dataValor = novaData ? dataEnsaiosAdministracionPortal_(novaData) : null;

  if (!idConcerto) return { ok:false, codigo:'VALIDATION', erro:'Falta o identificador do concerto' };
  if (novaData && !dataValor) return { ok:false, codigo:'VALIDATION', erro:'A nova data do concerto non é válida' };
  if (novoEstado && estadosValidos.indexOf(novoEstado) < 0) return { ok:false, codigo:'VALIDATION', erro:'O estado indicado non é válido' };
  if (!novaData && !novoEstado) return { ok:false, codigo:'VALIDATION', erro:'Non se indicou ningún cambio' };

  var cfg = configuracionConcertosAdministracionPortal_();
  var datosFolla = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID');
  var headers = datosFolla.headers;
  var row = datosFolla.rows.find(function (item) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Id', 'Id_Concerto', 'IdConcerto'])) === idConcerto;
  });
  if (!row) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou o concerto indicado' };

  var dataIndex = indiceHeaderEnsaiosPortal_(headers, ['Data']);
  var estadoIndex = indiceHeaderEnsaiosPortal_(headers, ['Estado']);
  if (dataIndex < 0 || estadoIndex < 0) return { ok:false, codigo:'SCHEMA', erro:'A folla Concertos non ten as columnas Data e Estado esperadas' };

  try {
    if (novaData) datosFolla.sheet.getRange(row.__row, dataIndex + 1).setValue(dataValor).setNumberFormat('yyyy-mm-dd');
    if (novoEstado) datosFolla.sheet.getRange(row.__row, estadoIndex + 1).setValue(novoEstado);
    SpreadsheetApp.flush();
  } catch (erro) {
    throw new Error('Diagnóstico CONCERTOS_SPREADSHEET_ID (' + cfg.concertosId + '): fallou a escritura. ' + String(erro && erro.message ? erro.message : erro));
  }

  return {
    ok:true,
    resultado:{
      idConcerto:idConcerto,
      data:novaData || serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])),
      estado:novoEstado || textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Estado'])),
      actualizadoPor:email
    }
  };
}

function diagnosticoConcertosPreview() {
  var props = PropertiesService.getScriptProperties();
  var cfg = configuracionConcertosAdministracionPortal_();
  var resultado = { ok:true, email:String(props.getProperty('WEB_TEST_EMAIL') || '').trim().toLowerCase(), documentos:[] };
  var probas = [
    { propiedade:'CONCERTOS_SPREADSHEET_ID', id:cfg.concertosId, folla:'Concertos' },
    { propiedade:'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID', id:cfg.asistenciasId, folla:'AsistenciasConcertos' },
    { propiedade:'CONCERTOS_REPERTORIO_SPREADSHEET_ID', id:cfg.concertosRepertorioId, folla:'ConcertosRepertorio' },
    { propiedade:'CONCERTOS_PERSOAS_SPREADSHEET_ID', id:cfg.persoasId, folla:'Persoas' }
  ];
  probas.forEach(function (proba) {
    try {
      var datos = filasEnsaiosAdministracionPortal_(proba.id, proba.folla, proba.propiedade);
      resultado.documentos.push({ propiedade:proba.propiedade, id:proba.id, folla:proba.folla, ok:true, filas:datos.rows.length });
    } catch (erro) {
      resultado.ok = false;
      resultado.documentos.push({ propiedade:proba.propiedade, id:proba.id, folla:proba.folla, ok:false, erro:String(erro && erro.message ? erro.message : erro) });
    }
  });
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
