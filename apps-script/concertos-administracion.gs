/* Administración de concertos desde o Portal SCPP. */

function configuracionConcertosAdministracionPortal_() {
  var props = PropertiesService.getScriptProperties();
  var base = typeof configuracionEnsaiosPortal_ === 'function' ? configuracionEnsaiosPortal_() : {};
  function valor(nome, fallback) { return String(props.getProperty(nome) || fallback || '').trim(); }
  var cfg = {
    concertosId: valor('CONCERTOS_SPREADSHEET_ID', base.concertosId),
    asistenciasId: valor('ASISTENCIAS_CONCERTOS_SPREADSHEET_ID'),
    concertosRepertorioId: valor('CONCERTOS_REPERTORIO_SPREADSHEET_ID'),
    persoasId: valor('CONCERTOS_PERSOAS_SPREADSHEET_ID', valor('PERSOAS_SPREADSHEET_ID', base.persoasId)),
    repertorioId: valor('REPERTORIO_SPREADSHEET_ID', base.repertorioId)
  };
  ['concertosId','asistenciasId','concertosRepertorioId','persoasId','repertorioId'].forEach(function (key) {
    if (!cfg[key]) throw new Error('Falta a configuración obrigatoria para Administración de concertos: ' + key);
  });
  return cfg;
}

function permisoConcertosAdministracionPortal_(email) {
  return permisoEnsaiosAdministracionPortal_(email);
}

function nomePersoaConcertoAdministracionPortal_(row) {
  var nomeCompleto = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['NomeCompleto','Nome completo','Nombre completo']));
  if (nomeCompleto) return nomeCompleto;
  var nome = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Nome','Nombre']));
  var apelidos = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Apelidos','Apellidos']));
  return [apelidos, nome].filter(Boolean).join(', ') || nome || apelidos;
}

function listarConcertosAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para administrar concertos' };

  var cfg = configuracionConcertosAdministracionPortal_();
  var concertos = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID').rows;
  var asistencias = filasEnsaiosAdministracionPortal_(cfg.asistenciasId, 'AsistenciasConcertos', 'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID').rows;
  var relacions = filasEnsaiosAdministracionPortal_(cfg.concertosRepertorioId, 'ConcertosRepertorio', 'CONCERTOS_REPERTORIO_SPREADSHEET_ID').rows;
  var persoas = filasEnsaiosAdministracionPortal_(cfg.persoasId, 'Persoas', 'PERSOAS_SPREADSHEET_ID').rows;
  var repertorio = filasEnsaiosAdministracionPortal_(cfg.repertorioId, 'Repertorio', 'REPERTORIO_SPREADSHEET_ID').rows;

  var persoasPorId = {};
  persoas.forEach(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id','Id_Persoa','IdPersoa']));
    if (!id) return;
    persoasPorId[id] = {
      idPersoa:id,
      nome:nomePersoaConcertoAdministracionPortal_(row),
      voz:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Voz']))
    };
  });

  var obrasPorId = {};
  repertorio.forEach(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Repertorio','Id','IdRepertorio']));
    if (!id) return;
    obrasPorId[id] = {
      idRepertorio:id,
      titulo:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Titulo','Título','Obra','Nome'])),
      autor:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Autor','Compositor']))
    };
  });

  var asistenciasPorConcerto = {};
  asistencias.forEach(function (row) {
    var idConcerto = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Concerto','Id_Conciertos','IdConcerto']));
    var idPersoa = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Persoa','Id_Persoa','IdPersoa']));
    if (!idConcerto || !idPersoa) return;
    var persoa = persoasPorId[idPersoa] || { idPersoa:idPersoa, nome:idPersoa, voz:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Voz'])) };
    var estado = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['EstadoAsistencia','Estado asistencia','Estado_asistencia','Asiste','Estado']));
    var estadoNormalizado = estado.toLowerCase();
    var asiste = estado === '' || estadoNormalizado === 'asiste' || booleanoEnsaiosPortal_(estado);
    if (!asistenciasPorConcerto[idConcerto]) asistenciasPorConcerto[idConcerto] = [];
    asistenciasPorConcerto[idConcerto].push({
      idPersoa:persoa.idPersoa,
      nome:persoa.nome,
      voz:persoa.voz || textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Voz'])),
      asiste:asiste
    });
  });

  var repertorioPorConcerto = {};
  relacions.forEach(function (row) {
    var idConcerto = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Conciertos','Concerto','IdConcerto']));
    var idRepertorio = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Repertorio','Repertorio','IdRepertorio']));
    if (!idConcerto || !idRepertorio) return;
    var obra = obrasPorId[idRepertorio] || { idRepertorio:idRepertorio, titulo:idRepertorio, autor:'' };
    if (!repertorioPorConcerto[idConcerto]) repertorioPorConcerto[idConcerto] = [];
    repertorioPorConcerto[idConcerto].push({
      idRepertorio:obra.idRepertorio,
      titulo:obra.titulo,
      autor:obra.autor,
      orde:Number(campoEnsaiosPortal_(row, ['Orde','Orden'])) || 0,
      solista:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Solista'])),
      notas:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Notas','Observacions','Observacións']))
    });
  });

  Object.keys(asistenciasPorConcerto).forEach(function (id) {
    asistenciasPorConcerto[id].sort(function (a,b) {
      var voz = String(a.voz).localeCompare(String(b.voz), 'gl');
      return voz || String(a.nome).localeCompare(String(b.nome), 'gl');
    });
  });
  Object.keys(repertorioPorConcerto).forEach(function (id) {
    repertorioPorConcerto[id].sort(function (a,b) { return (a.orde || 9999) - (b.orde || 9999) || String(a.titulo).localeCompare(String(b.titulo), 'gl'); });
  });

  var out = concertos.map(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Concerto', 'IdConcerto']));
    var listaAsistencias = asistenciasPorConcerto[id] || [];
    var listaObras = repertorioPorConcerto[id] || [];
    return {
      idConcerto:id,
      data:serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])),
      nome:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Nome'])),
      cidade:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cidade'])),
      lugar:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Lugar'])),
      hora:serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['Hora'])),
      estado:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Estado'])),
      mostrarWeb:booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Mostrar_Web', 'MostrarWeb'])),
      destacadoWeb:booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Destacado_Web', 'DestacadoWeb'])),
      asistencias:listaAsistencias.filter(function (item) { return item.asiste; }).length,
      obras:listaObras.length,
      asistentes:listaAsistencias,
      repertorio:listaObras
    };
  }).filter(function (item) { return item.idConcerto; });

  out.sort(function (a,b) { return String(b.data).localeCompare(String(a.data)); });
  return { ok:true, nivel:permiso.nivel, concertos:out };
}

function actualizarConcertoAdministracionPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para administrar concertos' };

  var idConcerto = textoEnsaiosPortal_(datos && datos.idConcerto);
  var novaData = textoEnsaiosPortal_(datos && datos.data);
  var novoEstado = textoEnsaiosPortal_(datos && datos.estado);
  var estadosValidos = ['Previsto','Confirmado','Aprazado','Cancelado','Realizado'];
  var dataValor = novaData ? dataEnsaiosAdministracionPortal_(novaData) : null;
  if (!idConcerto) return { ok:false, codigo:'VALIDATION', erro:'Falta o identificador do concerto' };
  if (novaData && !dataValor) return { ok:false, codigo:'VALIDATION', erro:'A nova data do concerto non é válida' };
  if (novoEstado && estadosValidos.indexOf(novoEstado) < 0) return { ok:false, codigo:'VALIDATION', erro:'O estado indicado non é válido' };
  if (!novaData && !novoEstado) return { ok:false, codigo:'VALIDATION', erro:'Non se indicou ningún cambio' };

  var cfg = configuracionConcertosAdministracionPortal_();
  var datosFolla = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID');
  var headers = datosFolla.headers;
  var row = datosFolla.rows.find(function (item) { return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Id','Id_Concerto','IdConcerto'])) === idConcerto; });
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
  return { ok:true, resultado:{ idConcerto:idConcerto, data:novaData || serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])), estado:novoEstado || textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Estado'])), actualizadoPor:email } };
}
