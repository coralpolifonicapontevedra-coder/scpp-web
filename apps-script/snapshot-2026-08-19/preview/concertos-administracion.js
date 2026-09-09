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
  datos = datos || {};
  if (textoEnsaiosPortal_(datos.operacion) === 'detalle') {
    return listarConcertoOperacionPortal_(datos);
  }

  var email = textoEnsaiosPortal_(datos.email).toLowerCase();
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
      caracteristicas: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Características', 'Caracteristicas'])),
      hora: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['Hora'])),
      estado: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Estado'])),
      mostrarWeb: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Mostrar_Web', 'MostrarWeb'])),
      destacadoWeb: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Destacado_Web', 'DestacadoWeb'])),
      cartel: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cartel'])),
      triptico: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Triptico', 'Tríptico'])),
      prensa: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Prensa'])),
      numeroConcerto: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['NumeroConcerto'])),
      ordeHistorica: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['OrdeHistorica'])),
      asistencias: contaAsistencias[id] || 0,
      obras: contaRepertorio[id] || 0
    };
  }).filter(function (item) { return item.idConcerto; });

  out.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
  return { ok:true, nivel:permiso.nivel, concertos:out };
}

function crearConcertoAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para administrar concertos' };

  var data = textoEnsaiosPortal_(datos && datos.data);
  var nome = textoEnsaiosPortal_(datos && datos.nome);
  var cidade = textoEnsaiosPortal_(datos && datos.cidade);
  var lugar = textoEnsaiosPortal_(datos && datos.lugar);
  var hora = textoEnsaiosPortal_(datos && datos.hora);
  var caracteristicas = textoEnsaiosPortal_(datos && datos.caracteristicas);
  var estado = textoEnsaiosPortal_(datos && datos.estado) || 'Previsto';
  var mostrarWeb = Boolean(datos && datos.mostrarWeb);
  var destacadoWeb = Boolean(datos && datos.destacadoWeb);
  var estadosValidos = ['Previsto', 'Confirmado', 'Aprazado', 'Cancelado', 'Realizado'];
  var dataValor = dataEnsaiosAdministracionPortal_(data);

  if (!dataValor) return { ok:false, codigo:'VALIDATION', erro:'Indica unha data válida para o concerto' };
  if (!nome) return { ok:false, codigo:'VALIDATION', erro:'Indica o nome ou título do concerto' };
  if (nome.length > 250 || cidade.length > 150 || lugar.length > 250 || caracteristicas.length > 3000) return { ok:false, codigo:'VALIDATION', erro:'Algún dos textos supera a lonxitude permitida' };
  if (hora && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(hora)) return { ok:false, codigo:'VALIDATION', erro:'A hora debe ter formato HH:MM' };
  if (estadosValidos.indexOf(estado) < 0) return { ok:false, codigo:'VALIDATION', erro:'O estado indicado non é válido' };
  if (destacadoWeb && !mostrarWeb) return { ok:false, codigo:'VALIDATION', erro:'Un concerto destacado debe estar marcado tamén para mostrar na web' };

  var cfg = configuracionConcertosAdministracionPortal_();
  var datosFolla = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID');
  var headers = datosFolla.headers;
  var obrigatorias = {
    id: indiceHeaderEnsaiosPortal_(headers, ['Id']),
    data: indiceHeaderEnsaiosPortal_(headers, ['Data']),
    nome: indiceHeaderEnsaiosPortal_(headers, ['Nome']),
    cidade: indiceHeaderEnsaiosPortal_(headers, ['Cidade']),
    lugar: indiceHeaderEnsaiosPortal_(headers, ['Lugar']),
    caracteristicas: indiceHeaderEnsaiosPortal_(headers, ['Características', 'Caracteristicas']),
    hora: indiceHeaderEnsaiosPortal_(headers, ['Hora']),
    mostrarWeb: indiceHeaderEnsaiosPortal_(headers, ['Mostrar_Web', 'MostrarWeb']),
    destacadoWeb: indiceHeaderEnsaiosPortal_(headers, ['Destacado_Web', 'DestacadoWeb']),
    estado: indiceHeaderEnsaiosPortal_(headers, ['Estado'])
  };
  var falta = Object.keys(obrigatorias).find(function (key) { return obrigatorias[key] < 0; });
  if (falta) return { ok:false, codigo:'SCHEMA', erro:'A folla Concertos non ten todas as columnas necesarias para dar unha alta' };

  var idConcerto = Utilities.getUuid();
  var fila = headers.map(function () { return ''; });
  fila[obrigatorias.id] = idConcerto;
  fila[obrigatorias.data] = dataValor;
  fila[obrigatorias.nome] = nome;
  fila[obrigatorias.cidade] = cidade;
  fila[obrigatorias.lugar] = lugar;
  fila[obrigatorias.caracteristicas] = caracteristicas;
  fila[obrigatorias.hora] = hora;
  fila[obrigatorias.mostrarWeb] = mostrarWeb;
  fila[obrigatorias.destacadoWeb] = destacadoWeb;
  fila[obrigatorias.estado] = estado;

  datosFolla.sheet.appendRow(fila);
  var rowNumber = datosFolla.sheet.getLastRow();
  datosFolla.sheet.getRange(rowNumber, obrigatorias.data + 1).setNumberFormat('yyyy-mm-dd');
  if (hora) datosFolla.sheet.getRange(rowNumber, obrigatorias.hora + 1).setNumberFormat('hh:mm');
  SpreadsheetApp.flush();

  return { ok:true, resultado:{ idConcerto:idConcerto, data:data, nome:nome, estado:estado, creadoPor:email } };
}

function eliminarConcertoAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para administrar concertos' };
  var idConcerto = textoEnsaiosPortal_(datos && datos.idConcerto);
  if (!idConcerto) return { ok:false, codigo:'VALIDATION', erro:'Falta o identificador do concerto' };

  var cfg = configuracionConcertosAdministracionPortal_();
  var datosFolla = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID');
  var row = datosFolla.rows.find(function (item) { return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Id', 'Id_Concerto', 'IdConcerto'])) === idConcerto; });
  if (!row) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou o concerto indicado' };

  var repertorio = filasEnsaiosAdministracionPortal_(cfg.concertosRepertorioId, 'ConcertosRepertorio', 'CONCERTOS_REPERTORIO_SPREADSHEET_ID').rows;
  var asistencias = filasEnsaiosAdministracionPortal_(cfg.asistenciasId, 'AsistenciasConcertos', 'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID').rows;
  var obras = repertorio.filter(function (item) { return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Id_Conciertos', 'Concerto', 'IdConcerto'])) === idConcerto; }).length;
  var persoas = asistencias.filter(function (item) { return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Concerto', 'Id_Conciertos', 'IdConcerto'])) === idConcerto; }).length;
  var tenMedios = Boolean(textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cartel'])) || textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Triptico', 'Tríptico'])) || textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Prensa'])));
  var historico = Boolean(textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['NumeroConcerto'])) || textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['OrdeHistorica'])));
  if (obras || persoas || tenMedios || historico) return { ok:false, codigo:'HAS_RELATIONS', erro:'Non se pode dar de baixa este concerto porque ten relacións. Retira primeiro esas relacións ou usa o estado Cancelado.' };

  datosFolla.sheet.deleteRow(row.__row);
  SpreadsheetApp.flush();
  return { ok:true, resultado:{ idConcerto:idConcerto, eliminadoPor:email } };
}

function actualizarConcertoAdministracionPortal_(datos) {
  datos = datos || {};
  var operacion = textoEnsaiosPortal_(datos.operacion);
  if (operacion === 'gardarAsistencias') return gardarAsistenciasConcertoPortal_(datos);
  if (operacion === 'gardarPrograma') return gardarProgramaConcertoPortal_(datos);

  var email = textoEnsaiosPortal_(datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para administrar concertos' };

  var idConcerto = textoEnsaiosPortal_(datos.idConcerto);
  var novaData = textoEnsaiosPortal_(datos.data);
  var novoEstado = textoEnsaiosPortal_(datos.estado);
  var estadosValidos = ['Previsto', 'Confirmado', 'Aprazado', 'Cancelado', 'Realizado'];
  var dataValor = novaData ? dataEnsaiosAdministracionPortal_(novaData) : null;
  if (!idConcerto) return { ok:false, codigo:'VALIDATION', erro:'Falta o identificador do concerto' };
  if (novaData && !dataValor) return { ok:false, codigo:'VALIDATION', erro:'A nova data do concerto non é válida' };
  if (novoEstado && estadosValidos.indexOf(novoEstado) < 0) return { ok:false, codigo:'VALIDATION', erro:'O estado indicado non é válido' };
  if (!novaData && !novoEstado) return { ok:false, codigo:'VALIDATION', erro:'Non se indicou ningún cambio' };

  var cfg = configuracionConcertosAdministracionPortal_();
  var datosFolla = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID');
  var headers = datosFolla.headers;
  var row = datosFolla.rows.find(function (item) { return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Id', 'Id_Concerto', 'IdConcerto'])) === idConcerto; });
  if (!row) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou o concerto indicado' };
  var dataIndex = indiceHeaderEnsaiosPortal_(headers, ['Data']);
  var estadoIndex = indiceHeaderEnsaiosPortal_(headers, ['Estado']);
  if (dataIndex < 0 || estadoIndex < 0) return { ok:false, codigo:'SCHEMA', erro:'A folla Concertos non ten as columnas Data e Estado esperadas' };
  if (novaData) datosFolla.sheet.getRange(row.__row, dataIndex + 1).setValue(dataValor).setNumberFormat('yyyy-mm-dd');
  if (novoEstado) datosFolla.sheet.getRange(row.__row, estadoIndex + 1).setValue(novoEstado);
  SpreadsheetApp.flush();
  return { ok:true, resultado:{ idConcerto:idConcerto, data:novaData || serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])), estado:novoEstado || textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Estado'])), actualizadoPor:email } };
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
    try { var d = filasEnsaiosAdministracionPortal_(proba.id, proba.folla, proba.propiedade); resultado.documentos.push({ propiedade:proba.propiedade, id:proba.id, folla:proba.folla, ok:true, filas:d.rows.length }); }
    catch (erro) { resultado.ok = false; resultado.documentos.push({ propiedade:proba.propiedade, id:proba.id, folla:proba.folla, ok:false, erro:String(erro && erro.message ? erro.message : erro) }); }
  });
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
