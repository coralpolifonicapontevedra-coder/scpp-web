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

function estadoAsistenciaConcertoPortal_(valor) {
  var texto = textoEnsaiosPortal_(valor).toLowerCase();
  if (['asiste', 'si', 'sí', 'true', '1', 'yes', 'x'].indexOf(texto) >= 0) return 'asiste';
  if (['non asiste', 'no asiste', 'false', '0', 'no'].indexOf(texto) >= 0) return 'non_asiste';
  if (['pendente', 'pendiente'].indexOf(texto) >= 0) return 'pendente';
  return '';
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

  var contaAsistencias = {};
  asistencias.forEach(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Concerto', 'Id_Conciertos', 'IdConcerto']));
    var estado = estadoAsistenciaConcertoPortal_(campoEnsaiosPortal_(row, ['EstadoAsistencia', 'Estado asistencia']));
    if (id && (estado === 'asiste' || !estado)) contaAsistencias[id] = (contaAsistencias[id] || 0) + 1;
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
    var estado = campoEnsaiosPortal_(row, ['Estado asistencia','Estado_asistencia','Asiste','Estado']);
    if (!asistenciasPorConcerto[idConcerto]) asistenciasPorConcerto[idConcerto] = [];
    asistenciasPorConcerto[idConcerto].push({
      idPersoa:persoa.idPersoa,
      nome:persoa.nome,
      voz:persoa.voz || textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Voz'])),
      asiste:estado === '' ? true : booleanoEnsaiosPortal_(estado)
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
      idConcerto: id,
      data: serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])),
      nome: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Nome'])),
      cidade: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cidade'])),
      lugar: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Lugar'])),
      hora: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['Hora'])),
      estado: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Estado'])),
      mostrarWeb: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Mostrar_Web', 'MostrarWeb'])),
      destacadoWeb: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Destacado_Web', 'DestacadoWeb'])),
      caracteristicas: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Características', 'Caracteristicas'])),
      cartel: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cartel'])),
      triptico: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Triptico', 'Tríptico'])),
      asistencias: listaAsistencias.filter(function (item) { return item.asiste; }).length,
      obras: listaObras.length,
      asistentes: listaAsistencias,
      repertorio: listaObras
    };
  }).filter(function (item) { return item.idConcerto; });

  out.sort(function (a,b) { return String(b.data).localeCompare(String(a.data)); });
  return { ok:true, nivel:permiso.nivel, concertos:out };
}

function gardarConcertoAdministracionPortal_(datos) {
  var email=textoEnsaiosPortal_(datos&&datos.email).toLowerCase(), permiso=permisoConcertosAdministracionPortal_(email);
  if(!permiso.escritura)return{ok:false,codigo:'FORBIDDEN',erro:'Usuario non autorizado para administrar concertos'};
  var entrada=datos&&datos.concerto||{}, data=textoEnsaiosPortal_(entrada.data), nome=textoEnsaiosPortal_(entrada.nome);
  if(!dataEnsaiosAdministracionPortal_(data)||!nome)return{ok:false,codigo:'VALIDATION',erro:'A data e o nome son obrigatorios'};
  var cfg=configuracionConcertosAdministracionPortal_(), f=filasEnsaiosAdministracionPortal_(cfg.concertosId,'Concertos','CONCERTOS_SPREADSHEET_ID');
  var id=textoEnsaiosPortal_(entrada.idConcerto), row=id?f.rows.find(function(r){return textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Id']))===id;}):null;
  if(id&&!row)return{ok:false,codigo:'NOT_FOUND',erro:'Non se atopou o concerto indicado'};
  if(!id){id=String(f.rows.reduce(function(m,r){var n=Number(campoEnsaiosPortal_(r,['Id']));return isFinite(n)?Math.max(m,n):m;},0)+1);row={__row:f.sheet.getLastRow()+1};f.sheet.getRange(row.__row,1,1,f.headers.length).setValues([f.headers.map(function(){return '';})]);}
  var valores={Id:id,Data:dataEnsaiosAdministracionPortal_(data),Nome:nome,Cidade:textoEnsaiosPortal_(entrada.cidade),Lugar:textoEnsaiosPortal_(entrada.lugar),Hora:textoEnsaiosPortal_(entrada.hora),'Características':textoEnsaiosPortal_(entrada.caracteristicas),Estado:textoEnsaiosPortal_(entrada.estado)||'Previsto','Mostrar_Web':entrada.mostrarWeb===true,'Destacado_Web':entrada.destacadoWeb===true};
  Object.keys(valores).forEach(function(c){var i=indiceHeaderEnsaiosPortal_(f.headers,[c,c==='Características'?'Caracteristicas':'']);if(i>=0)f.sheet.getRange(row.__row,i+1).setValue(valores[c]);});
  var di=indiceHeaderEnsaiosPortal_(f.headers,['Data']);if(di>=0)f.sheet.getRange(row.__row,di+1).setNumberFormat('yyyy-mm-dd');SpreadsheetApp.flush();
  return{ok:true,resultado:{idConcerto:id,creado:!entrada.idConcerto,actualizadoPor:email}};
}

function obterXestionConcertoAdministracionPortal_(datos){
  var email=textoEnsaiosPortal_(datos&&datos.email).toLowerCase(),permiso=permisoConcertosAdministracionPortal_(email);if(!permiso.escritura)return{ok:false,codigo:'FORBIDDEN',erro:'Usuario non autorizado'};
  var id=textoEnsaiosPortal_(datos&&datos.idConcerto);if(!id)return{ok:false,codigo:'VALIDATION',erro:'Falta o concerto'};var cfg=configuracionConcertosAdministracionPortal_();
  var rel=filasEnsaiosAdministracionPortal_(cfg.concertosRepertorioId,'ConcertosRepertorio','CONCERTOS_REPERTORIO_SPREADSHEET_ID').rows,rep=filasEnsaiosAdministracionPortal_(cfg.repertorioId,'Repertorio','REPERTORIO_SPREADSHEET_ID').rows,as=filasEnsaiosAdministracionPortal_(cfg.asistenciasId,'AsistenciasConcertos','ASISTENCIAS_CONCERTOS_SPREADSHEET_ID').rows,ps=filasEnsaiosAdministracionPortal_(cfg.persoasId,'Persoas','CONCERTOS_PERSOAS_SPREADSHEET_ID').rows;
  var programa=rel.filter(function(r){return textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Id_Conciertos','Concerto']))===id;}).map(function(r){return{obraId:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Id_Repertorio','Id_Obras'])),orde:Number(campoEnsaiosPortal_(r,['Orde']))||999,notas:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Notas'])),solista:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Solista']))};}).sort(function(a,b){return a.orde-b.orde;});
  var asistenciaPorPersoa={};as.forEach(function(r){if(textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Concerto','Id_Conciertos']))!==id)return;var pid=textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Persoa'])),estado=estadoAsistenciaConcertoPortal_(campoEnsaiosPortal_(r,['EstadoAsistencia','Estado asistencia'])),xustificada=booleanoEnsaiosPortal_(campoEnsaiosPortal_(r,['Xustificada','Justificada'])),motivo=textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Motivo','Xustificación','Xustificacion','Justificación','Justificacion'])),observacions=textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Observacións','Observacions','Observaciones']));asistenciaPorPersoa[pid]={estado:estado==='asiste'?'asiste':(estado==='non_asiste'?(xustificada?'xustificada':'non_asiste'):''),xustificacion:motivo,observacions:observacions};});
  var persoas=ps.map(function(r){var pid=textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Id','Row ID'])),rexistro=asistenciaPorPersoa[pid]||{};return{id:pid,nome:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Nome'])),primeiroApelido:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Primeiro apelido','PrimeiroApelido'])),segundoApelido:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Segundo apelido','SegundoApelido'])),voz:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Voz'])),estado:rexistro.estado||'',xustificacion:rexistro.xustificacion||''};}).filter(function(p){return p.id&&p.nome&&p.voz;});
  var obras=rep.map(function(r){return{id:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Id','Row ID'])),nome:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['NomeObra','Nome','Obra'])),autor:textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Compositor','Autor']))};}).filter(function(o){return o.id&&o.nome;});
  return{ok:true,programa:programa,persoas:persoas,obras:obras};
}

function gardarProgramaConcertoAdministracionPortal_(datos){
  var permiso=permisoConcertosAdministracionPortal_(textoEnsaiosPortal_(datos&&datos.email).toLowerCase());if(!permiso.escritura)return{ok:false,codigo:'FORBIDDEN',erro:'Usuario non autorizado'};var id=textoEnsaiosPortal_(datos&&datos.idConcerto),items=Array.isArray(datos&&datos.programa)?datos.programa:[];if(!id)return{ok:false,codigo:'VALIDATION',erro:'Falta o concerto'};
  var cfg=configuracionConcertosAdministracionPortal_(),f=filasEnsaiosAdministracionPortal_(cfg.concertosRepertorioId,'ConcertosRepertorio','CONCERTOS_REPERTORIO_SPREADSHEET_ID');for(var i=f.rows.length-1;i>=0;i--)if(textoEnsaiosPortal_(campoEnsaiosPortal_(f.rows[i],['Id_Conciertos','Concerto']))===id)f.sheet.deleteRow(f.rows[i].__row);
  items.forEach(function(x,n){f.sheet.appendRow(f.headers.map(function(h){if(h==='Id')return Utilities.getUuid();if(h==='Orde')return n+1;if(h==='Notas')return textoEnsaiosPortal_(x.notas);if(h==='Solista')return textoEnsaiosPortal_(x.solista);if(['Id_Conciertos','Concerto'].indexOf(h)>=0)return id;if(['Id_Repertorio','Id_Obras'].indexOf(h)>=0)return textoEnsaiosPortal_(x.obraId);return '';}));});SpreadsheetApp.flush();return{ok:true,total:items.length};
}

function gardarAsistentesConcertoAdministracionPortal_(datos){
  var permiso=permisoConcertosAdministracionPortal_(textoEnsaiosPortal_(datos&&datos.email).toLowerCase());if(!permiso.escritura)return{ok:false,codigo:'FORBIDDEN',erro:'Usuario non autorizado'};var id=textoEnsaiosPortal_(datos&&datos.idConcerto),items=Array.isArray(datos&&datos.persoas)?datos.persoas:[];if(!id)return{ok:false,codigo:'VALIDATION',erro:'Falta o concerto'};
  var cfg=configuracionConcertosAdministracionPortal_(),f=filasEnsaiosAdministracionPortal_(cfg.asistenciasId,'AsistenciasConcertos','ASISTENCIAS_CONCERTOS_SPREADSHEET_ID');for(var i=f.rows.length-1;i>=0;i--)if(textoEnsaiosPortal_(campoEnsaiosPortal_(f.rows[i],['Concerto','Id_Conciertos']))===id)f.sheet.deleteRow(f.rows[i].__row);
  var xustificadaIndex=indiceHeaderEnsaiosPortal_(f.headers,['Xustificada','Justificada']),motivoIndex=indiceHeaderEnsaiosPortal_(f.headers,['Motivo','Xustificación','Xustificacion','Justificación','Justificacion','Observacións','Observacions','Observaciones']);
  var observacionsIndex=indiceHeaderEnsaiosPortal_(f.headers,['Observacións','Observacions','Observaciones']),dataIndex=indiceHeaderEnsaiosPortal_(f.headers,['DataRexistro']),autorIndex=indiceHeaderEnsaiosPortal_(f.headers,['RexistradaPor']);
  items.filter(function(x){return['asiste','non_asiste','xustificada'].indexOf(textoEnsaiosPortal_(x.estado))>=0;}).forEach(function(x){var estado=textoEnsaiosPortal_(x.estado),nome=[textoEnsaiosPortal_(x.primeiroApelido),textoEnsaiosPortal_(x.segundoApelido)].filter(Boolean).join(' ')+', '+textoEnsaiosPortal_(x.nome);f.sheet.appendRow(f.headers.map(function(h,col){if(['Id_AsistenciaConcerto','Id_Asistencia','Id'].indexOf(h)>=0)return Utilities.getUuid();if(['Concerto','Id_Conciertos'].indexOf(h)>=0)return id;if(h==='Persoa')return textoEnsaiosPortal_(x.id);if(h==='Voz')return textoEnsaiosPortal_(x.voz);if(h==='Nome_Completo')return nome;if(['EstadoAsistencia','Estado asistencia'].indexOf(h)>=0)return estado==='asiste'?'Asiste':'Non asiste';if(col===xustificadaIndex)return estado==='xustificada';if(col===motivoIndex)return estado==='xustificada'?textoEnsaiosPortal_(x.xustificacion):'';if(col===observacionsIndex)return textoEnsaiosPortal_(x.observacions);if(col===dataIndex)return new Date();if(col===autorIndex)return email;return '';}));});SpreadsheetApp.flush();return{ok:true,total:items.length,columnaXustificacion:motivoIndex>=0?f.headers[motivoIndex]:''};
}

function actualizarMedioConcertoAdministracionPortal_(datos){
  var email=textoEnsaiosPortal_(datos&&datos.email).toLowerCase(),permiso=permisoConcertosAdministracionPortal_(email);if(!permiso.escritura)return{ok:false,codigo:'FORBIDDEN',erro:'Usuario non autorizado'};
  var id=textoEnsaiosPortal_(datos&&datos.idConcerto),tipo=textoEnsaiosPortal_(datos&&datos.tipo),ruta=textoEnsaiosPortal_(datos&&datos.ruta);if(!id||['cartel','triptico'].indexOf(tipo)<0||!ruta)return{ok:false,codigo:'VALIDATION',erro:'Faltan datos do documento'};
  var cfg=configuracionConcertosAdministracionPortal_(),f=filasEnsaiosAdministracionPortal_(cfg.concertosId,'Concertos','CONCERTOS_SPREADSHEET_ID'),row=f.rows.find(function(r){return textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Id']))===id;});if(!row)return{ok:false,codigo:'NOT_FOUND',erro:'Non se atopou o concerto'};
  var columna=tipo==='cartel'?'Cartel':'Triptico',indice=indiceHeaderEnsaiosPortal_(f.headers,[columna,tipo==='triptico'?'Tríptico':'']);if(indice<0)return{ok:false,codigo:'SCHEMA',erro:'Falta a columna '+columna};f.sheet.getRange(row.__row,indice+1).setValue(ruta);SpreadsheetApp.flush();return{ok:true,idConcerto:id,tipo:tipo,ruta:ruta};
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
