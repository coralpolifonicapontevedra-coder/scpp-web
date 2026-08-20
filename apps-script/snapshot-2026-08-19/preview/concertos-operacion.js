/* Operación de concertos: programa e asistencias en lote. */

function configuracionConcertosOperacionPortal_() {
  var props = PropertiesService.getScriptProperties();
  var nomes = [
    'CONCERTOS_SPREADSHEET_ID',
    'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID',
    'CONCERTOS_REPERTORIO_SPREADSHEET_ID',
    'CONCERTOS_PERSOAS_SPREADSHEET_ID',
    'REPERTORIO_SPREADSHEET_ID'
  ];
  var out = {};
  nomes.forEach(function (nome) {
    var valor = String(props.getProperty(nome) || '').trim();
    if (!valor) throw new Error('Falta a propiedade obrigatoria do ambiente: ' + nome);
    out[nome] = valor;
  });
  return {
    concertosId: out.CONCERTOS_SPREADSHEET_ID,
    asistenciasId: out.ASISTENCIAS_CONCERTOS_SPREADSHEET_ID,
    concertosRepertorioId: out.CONCERTOS_REPERTORIO_SPREADSHEET_ID,
    persoasId: out.CONCERTOS_PERSOAS_SPREADSHEET_ID,
    repertorioId: out.REPERTORIO_SPREADSHEET_ID
  };
}

function nomePersoaConcertoOperacion_(row) {
  var completo = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Nome_Completo', 'Nome completo', 'Nome e apelidos', 'NomeApelidos']));
  if (completo) return completo;
  return [textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Nome'])), textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Apelidos', 'Apellidos']))].filter(Boolean).join(' ').trim();
}

function persoaActivaConcertoOperacion_(row) {
  var baixa = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['DataBaixa', 'Data baixa']));
  if (baixa) return false;
  var activo = campoEnsaiosPortal_(row, ['Activo', 'Activa']);
  if (activo !== '' && activo !== null && activo !== undefined) return booleanoEnsaiosPortal_(activo);
  var estado = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Estado'])).toLowerCase();
  return estado !== 'baixa' && estado !== 'inactivo' && estado !== 'inactiva';
}

function listarConcertoOperacionPortal_(datos) {
  datos = datos || {};
  var email = textoEnsaiosPortal_(datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para xestionar concertos' };
  var idConcerto = textoEnsaiosPortal_(datos.idConcerto);
  if (!idConcerto) return { ok:false, codigo:'VALIDATION', erro:'Falta o identificador do concerto' };

  var cfg = configuracionConcertosOperacionPortal_();
  var concertos = filasEnsaiosAdministracionPortal_(cfg.concertosId, 'Concertos', 'CONCERTOS_SPREADSHEET_ID').rows;
  var concertoRow = concertos.find(function (row) { return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Concerto', 'IdConcerto'])) === idConcerto; });
  if (!concertoRow) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou o concerto indicado' };

  var persoasRows = filasEnsaiosAdministracionPortal_(cfg.persoasId, 'Persoas', 'CONCERTOS_PERSOAS_SPREADSHEET_ID').rows;
  var persoas = persoasRows.map(function (row) {
    return { idPersoa:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Persoa', 'Row ID'])), nome:nomePersoaConcertoOperacion_(row), voz:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Voz'])) || 'Sen voz indicada', activa:persoaActivaConcertoOperacion_(row) };
  }).filter(function (p) { return p.idPersoa && p.nome && p.activa; });
  var ordeVoces = { Soprano:1, Contralto:2, Tenor:3, Baixo:4 };
  persoas.sort(function (a, b) { var dv = (ordeVoces[a.voz] || 99) - (ordeVoces[b.voz] || 99); return dv || a.nome.localeCompare(b.nome, 'gl', { sensitivity:'base' }); });

  var asistenciasRows = filasEnsaiosAdministracionPortal_(cfg.asistenciasId, 'AsistenciasConcertos', 'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID').rows;
  var asistentes = asistenciasRows.filter(function (row) {
    var concerto = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Concerto', 'Id_Conciertos', 'IdConcerto']));
    if (concerto !== idConcerto) return false;
    var estado = campoEnsaiosPortal_(row, ['Estado asistencia', 'EstadoAsistencia', 'Asiste']);
    return estado === '' || estado === null || estado === undefined ? true : booleanoEnsaiosPortal_(estado);
  }).map(function (row) { return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Persoa', 'Id_Persoa', 'IdPersoa'])); }).filter(Boolean);

  var repertorioRows = filasEnsaiosAdministracionPortal_(cfg.repertorioId, 'Repertorio', 'REPERTORIO_SPREADSHEET_ID').rows;
  var catalogo = repertorioRows.map(function (row) {
    return { idRepertorio:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Repertorio', 'Row ID'])), nome:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['NomeObra', 'Nome', 'Obra'])), autor:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Compositor', 'Autor'])) };
  }).filter(function (obra) { return obra.idRepertorio && obra.nome; });
  catalogo.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'gl', { sensitivity:'base' }); });

  var programaRows = filasEnsaiosAdministracionPortal_(cfg.concertosRepertorioId, 'ConcertosRepertorio', 'CONCERTOS_REPERTORIO_SPREADSHEET_ID').rows;
  var programa = programaRows.filter(function (row) { return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Conciertos', 'Concerto', 'IdConcerto'])) === idConcerto; }).map(function (row) {
    return { idRelacion:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Row ID'])), idRepertorio:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Repertorio', 'Id_Obras', 'Obra'])), orde:Number(campoEnsaiosPortal_(row, ['Orde'])) || 999, notas:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Notas'])), solista:textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Solista'])) };
  }).sort(function (a, b) { return a.orde - b.orde; });

  return { ok:true, nivel:permiso.nivel, concerto:{ idConcerto:idConcerto, data:serializarDataEnsaiosPortal_(campoEnsaiosPortal_(concertoRow, ['Data'])), nome:textoEnsaiosPortal_(campoEnsaiosPortal_(concertoRow, ['Nome'])), cidade:textoEnsaiosPortal_(campoEnsaiosPortal_(concertoRow, ['Cidade'])), lugar:textoEnsaiosPortal_(campoEnsaiosPortal_(concertoRow, ['Lugar'])), hora:serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(concertoRow, ['Hora'])), estado:textoEnsaiosPortal_(campoEnsaiosPortal_(concertoRow, ['Estado'])), cartel:textoEnsaiosPortal_(campoEnsaiosPortal_(concertoRow, ['Cartel'])), triptico:textoEnsaiosPortal_(campoEnsaiosPortal_(concertoRow, ['Triptico', 'Tríptico'])) }, persoas:persoas, asistentes:asistentes, repertorio:catalogo, programa:programa };
}

function gardarAsistenciasConcertoPortal_(datos) {
  datos = datos || {};
  var email = textoEnsaiosPortal_(datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para xestionar concertos' };
  var idConcerto = textoEnsaiosPortal_(datos.idConcerto);
  var idsPersoas = Array.isArray(datos.idsPersoas) ? datos.idsPersoas.map(textoEnsaiosPortal_).filter(Boolean) : [];
  idsPersoas = idsPersoas.filter(function (id, i, arr) { return arr.indexOf(id) === i; });
  if (!idConcerto) return { ok:false, codigo:'VALIDATION', erro:'Falta o identificador do concerto' };

  var cfg = configuracionConcertosOperacionPortal_();
  var persoasData = filasEnsaiosAdministracionPortal_(cfg.persoasId, 'Persoas', 'CONCERTOS_PERSOAS_SPREADSHEET_ID');
  var persoasMap = {};
  persoasData.rows.forEach(function (row) { var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Persoa', 'Row ID'])); if (id) persoasMap[id] = row; });
  var datosFolla = filasEnsaiosAdministracionPortal_(cfg.asistenciasId, 'AsistenciasConcertos', 'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID');
  var headers = datosFolla.headers;
  var idxId = indiceHeaderEnsaiosPortal_(headers, ['Id_Asistencia', 'Id']);
  var idxConcerto = indiceHeaderEnsaiosPortal_(headers, ['Concerto', 'Id_Conciertos', 'IdConcerto']);
  var idxPersoa = indiceHeaderEnsaiosPortal_(headers, ['Persoa', 'Id_Persoa', 'IdPersoa']);
  var idxVoz = indiceHeaderEnsaiosPortal_(headers, ['Voz']);
  var idxEstado = indiceHeaderEnsaiosPortal_(headers, ['Estado asistencia', 'EstadoAsistencia', 'Asiste']);
  if (idxId < 0 || idxConcerto < 0 || idxPersoa < 0) return { ok:false, codigo:'SCHEMA', erro:'A folla AsistenciasConcertos non ten as columnas esperadas' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    datosFolla.rows.filter(function (row) { return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Concerto', 'Id_Conciertos', 'IdConcerto'])) === idConcerto; }).map(function (row) { return row.__row; }).sort(function (a, b) { return b - a; }).forEach(function (rowNumber) { datosFolla.sheet.deleteRow(rowNumber); });
    if (idsPersoas.length) {
      var filas = idsPersoas.map(function (idPersoa) { var rowPersoa = persoasMap[idPersoa]; var fila = headers.map(function () { return ''; }); fila[idxId] = Utilities.getUuid(); fila[idxConcerto] = idConcerto; fila[idxPersoa] = idPersoa; if (idxVoz >= 0) fila[idxVoz] = textoEnsaiosPortal_(campoEnsaiosPortal_(rowPersoa, ['Voz'])); if (idxEstado >= 0) fila[idxEstado] = true; return fila; });
      datosFolla.sheet.getRange(datosFolla.sheet.getLastRow() + 1, 1, filas.length, headers.length).setValues(filas);
    }
    SpreadsheetApp.flush();
  } finally { try { lock.releaseLock(); } catch (_) {} }
  return { ok:true, resultado:{ idConcerto:idConcerto, total:idsPersoas.length, actualizadoPor:email } };
}

function gardarProgramaConcertoPortal_(datos) {
  datos = datos || {};
  var email = textoEnsaiosPortal_(datos.email).toLowerCase();
  var permiso = permisoConcertosAdministracionPortal_(email);
  if (!permiso.escritura) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado para xestionar concertos' };
  var idConcerto = textoEnsaiosPortal_(datos.idConcerto);
  var items = Array.isArray(datos.programa) ? datos.programa.slice(0, 100) : [];
  if (!idConcerto) return { ok:false, codigo:'VALIDATION', erro:'Falta o identificador do concerto' };

  var cfg = configuracionConcertosOperacionPortal_();
  var repertorio = filasEnsaiosAdministracionPortal_(cfg.repertorioId, 'Repertorio', 'REPERTORIO_SPREADSHEET_ID').rows;
  var idsValidos = {};
  repertorio.forEach(function (row) { var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Repertorio', 'Row ID'])); if (id) idsValidos[id] = true; });
  var limpos = [], usados = {};
  items.forEach(function (item) { var idRepertorio = textoEnsaiosPortal_(item && item.idRepertorio); if (!idRepertorio || usados[idRepertorio] || !idsValidos[idRepertorio]) return; usados[idRepertorio] = true; limpos.push({ idRepertorio:idRepertorio, orde:limpos.length + 1, notas:textoEnsaiosPortal_(item.notas).slice(0, 1000), solista:textoEnsaiosPortal_(item.solista).slice(0, 250) }); });

  var datosFolla = filasEnsaiosAdministracionPortal_(cfg.concertosRepertorioId, 'ConcertosRepertorio', 'CONCERTOS_REPERTORIO_SPREADSHEET_ID');
  var headers = datosFolla.headers;
  var idxId = indiceHeaderEnsaiosPortal_(headers, ['Id']);
  var idxOrde = indiceHeaderEnsaiosPortal_(headers, ['Orde']);
  var idxNotas = indiceHeaderEnsaiosPortal_(headers, ['Notas']);
  var idxSolista = indiceHeaderEnsaiosPortal_(headers, ['Solista']);
  var idxConcerto = indiceHeaderEnsaiosPortal_(headers, ['Id_Conciertos', 'Concerto', 'IdConcerto']);
  var idxRepertorio = indiceHeaderEnsaiosPortal_(headers, ['Id_Repertorio', 'Id_Obras', 'Obra']);
  if (idxId < 0 || idxConcerto < 0 || idxRepertorio < 0 || idxOrde < 0) return { ok:false, codigo:'SCHEMA', erro:'A folla ConcertosRepertorio non ten as columnas esperadas' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    datosFolla.rows.filter(function (row) { return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Conciertos', 'Concerto', 'IdConcerto'])) === idConcerto; }).map(function (row) { return row.__row; }).sort(function (a, b) { return b - a; }).forEach(function (rowNumber) { datosFolla.sheet.deleteRow(rowNumber); });
    if (limpos.length) {
      var filas = limpos.map(function (item) { var fila = headers.map(function () { return ''; }); fila[idxId] = Utilities.getUuid(); fila[idxOrde] = item.orde; fila[idxConcerto] = idConcerto; fila[idxRepertorio] = item.idRepertorio; if (idxNotas >= 0) fila[idxNotas] = item.notas; if (idxSolista >= 0) fila[idxSolista] = item.solista; return fila; });
      datosFolla.sheet.getRange(datosFolla.sheet.getLastRow() + 1, 1, filas.length, headers.length).setValues(filas);
    }
    SpreadsheetApp.flush();
  } finally { try { lock.releaseLock(); } catch (_) {} }
  return { ok:true, resultado:{ idConcerto:idConcerto, total:limpos.length, actualizadoPor:email } };
}
