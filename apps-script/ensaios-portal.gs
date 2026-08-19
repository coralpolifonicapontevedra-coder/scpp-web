/*
 * Módulo Ensaios do Portal SCPP.
 *
 * Accións que debe despachar Código.gs/doPost:
 *   listarEnsaiosPortal              -> listarEnsaiosPortal_(datos)
 *   gardarAsistenciaEnsaioPortal     -> gardarAsistenciaEnsaioPortal_(datos)
 *   gardarEnsaioRepertorioPortal     -> gardarEnsaioRepertorioPortal_(datos)
 *   obterSeguimentoEnsaiosPortal     -> obterSeguimentoEnsaiosPortal_(datos)
 *
 * Os IDs son configuración non secreta. Poden sobrescribirse mediante Script Properties.
 */

var ENSAIOS_CONFIG_ = {
  ensaiosId: '1YJkIH4DpuOQShAP8fcSq_TrLPDn08zv_tfKNjq297wc',
  asistenciasId: '1yp0Gc_GaewODS6IaPB9p2cdKqeOCbnyehL_-HzpdUQI',
  ensaiosRepertorioId: '155FLEl07h8LwlrSVLEhFsbkgJMqIf4E6k6lCXf8x_JE',
  persoasId: '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
  concertosId: '1vYlC1VO1hql8jJVkt1OBXnbH7GvUVe4XXe5TSIJk2dU',
  repertorioId: '1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw'
};

function configuracionEnsaiosPortal_() {
  var props = PropertiesService.getScriptProperties();
  return {
    ensaiosId: props.getProperty('ENSAIOS_SPREADSHEET_ID') || ENSAIOS_CONFIG_.ensaiosId,
    asistenciasId: props.getProperty('ASISTENCIAS_ENSAIOS_SPREADSHEET_ID') || ENSAIOS_CONFIG_.asistenciasId,
    ensaiosRepertorioId: props.getProperty('ENSAIOS_REPERTORIO_SPREADSHEET_ID') || ENSAIOS_CONFIG_.ensaiosRepertorioId,
    persoasId: props.getProperty('PERSOAS_SPREADSHEET_ID') || ENSAIOS_CONFIG_.persoasId,
    concertosId: props.getProperty('CONCERTOS_SPREADSHEET_ID') || ENSAIOS_CONFIG_.concertosId,
    repertorioId: props.getProperty('REPERTORIO_SPREADSHEET_ID') || ENSAIOS_CONFIG_.repertorioId
  };
}

function normalizarEnsaiosPortal_(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function textoEnsaiosPortal_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function booleanoEnsaiosPortal_(valor) {
  if (valor === true) return true;
  return ['true', '1', 'si', 'sí', 'yes', 'x'].indexOf(String(valor || '').trim().toLowerCase()) >= 0;
}

function follaEnsaiosPortal_(spreadsheetId, nomeEsperado) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  return ss.getSheetByName(nomeEsperado) || ss.getSheets()[0];
}

function filasEnsaiosPortal_(spreadsheetId, nomeEsperado) {
  var sheet = follaEnsaiosPortal_(spreadsheetId, nomeEsperado);
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { sheet: sheet, headers: [], rows: [] };
  var headers = values[0].map(function (h) { return textoEnsaiosPortal_(h); });
  var rows = values.slice(1).filter(function (row) {
    return row.some(function (cell) { return textoEnsaiosPortal_(cell) !== ''; });
  }).map(function (row, index) {
    var item = { __row: index + 2 };
    headers.forEach(function (header, i) { item[header] = row[i]; });
    return item;
  });
  return { sheet: sheet, headers: headers, rows: rows };
}

function campoEnsaiosPortal_(row, nomes) {
  var keys = Object.keys(row || {});
  for (var i = 0; i < nomes.length; i++) {
    var target = normalizarEnsaiosPortal_(nomes[i]);
    for (var j = 0; j < keys.length; j++) {
      if (normalizarEnsaiosPortal_(keys[j]) === target) return row[keys[j]];
    }
  }
  return '';
}

function indiceHeaderEnsaiosPortal_(headers, nomes) {
  for (var i = 0; i < nomes.length; i++) {
    var target = normalizarEnsaiosPortal_(nomes[i]);
    for (var j = 0; j < headers.length; j++) {
      if (normalizarEnsaiosPortal_(headers[j]) === target) return j;
    }
  }
  return -1;
}

function serializarDataEnsaiosPortal_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone() || 'Europe/Madrid', 'yyyy-MM-dd');
  }
  return textoEnsaiosPortal_(valor);
}

function serializarHoraEnsaiosPortal_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone() || 'Europe/Madrid', 'HH:mm');
  }
  return textoEnsaiosPortal_(valor);
}

function permisoEnsaiosPortal_(email) {
  var props = PropertiesService.getScriptProperties();
  var ambiente = String(props.getProperty('SCPP_ENVIRONMENT') || '').trim().toLowerCase();
  var correo = textoEnsaiosPortal_(email).toLowerCase();

  // En Preview só o correo de proba configurado recibe permisos de escritura.
  // En produción mantense intacta a autorización baseada na táboa Persoas.
  if (ambiente === 'test') {
    var correoProba = String(props.getProperty('WEB_TEST_EMAIL') || '').trim().toLowerCase();
    var autorizadoProba = !!correo && !!correoProba && correo === correoProba;
    if (autorizadoProba) {
      return { autorizado: true, escritura: true, nivel: 'Administración', cargo: 'Proba' };
    }
  }

  var cfg = configuracionEnsaiosPortal_();
  var datos = filasEnsaiosPortal_(cfg.persoasId, 'Persoas');
  var row = datos.rows.find(function (item) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Email', 'Correo', 'CorreoElectronico'])).toLowerCase() === correo;
  });
  if (!row) return { autorizado: false, escritura: false, nivel: '' };

  var activo = campoEnsaiosPortal_(row, ['Activo', 'Activa', 'Estado']);
  if (activo !== '' && ['baixa', 'baja', 'inactivo', 'inactiva', 'false', '0'].indexOf(textoEnsaiosPortal_(activo).toLowerCase()) >= 0) {
    return { autorizado: false, escritura: false, nivel: '' };
  }

  var cargo = normalizarEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cargo']));
  var cargosXunta = ['presidente', 'vicepresidente', 'vicepresidenta', 'secretario', 'secretaria', 'vicesecretario', 'vicesecretaria', 'tesoureiro', 'tesoureira', 'tesorero', 'tesorera', 'contador', 'contadora', 'arquiveirobibliotecario', 'arquiveirabibliotecaria', 'vogal', 'vogais', 'vocal', 'vocales'];
  var escritura = cargosXunta.some(function (item) { return cargo === item || cargo.indexOf(item) === 0; });
  var direccion = cargo.indexOf('director') === 0 || cargo.indexOf('directora') === 0 || cargo.indexOf('direccion') === 0;
  return {
    autorizado: escritura || direccion,
    escritura: escritura,
    nivel: escritura ? 'Xunta Directiva' : (direccion ? 'Dirección' : ''),
    cargo: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cargo']))
  };
}

function esCoralistaActivoEnsaiosPortal_(row) {
  var voz = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Voz']));
  if (!voz) return false;
  var estado = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Activo', 'Estado'])).toLowerCase();
  return ['baixa', 'baja', 'inactivo', 'inactiva', 'false', '0'].indexOf(estado) < 0;
}

function listarEnsaiosPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);
  if (!permiso.autorizado) return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado' };

  var cfg = configuracionEnsaiosPortal_();
  var ensaios = filasEnsaiosPortal_(cfg.ensaiosId, 'Ensaios').rows;
  var asistencias = filasEnsaiosPortal_(cfg.asistenciasId, 'AsistenciasEnsaios').rows;
  var ensaiosRep = filasEnsaiosPortal_(cfg.ensaiosRepertorioId, 'EnsaiosRepertorio').rows;
  var persoas = filasEnsaiosPortal_(cfg.persoasId, 'Persoas').rows.filter(esCoralistaActivoEnsaiosPortal_);
  var concertos = filasEnsaiosPortal_(cfg.concertosId, 'Concertos').rows;
  var repertorio = filasEnsaiosPortal_(cfg.repertorioId, 'Repertorio').rows;

  var concertosMap = {};
  concertos.forEach(function (row) {
    var id = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Concerto', 'Id_Conciertos', 'Row ID']));
    if (id) concertosMap[id] = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Nome', 'Nombre', 'Concerto']));
  });

  var persoasOut = persoas.map(function (row) {
    var nome = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Nome', 'Nombre']));
    var apelido1 = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['PrimeiroApelido', 'PrimerApellido', 'Apelido1']));
    var apelido2 = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['SegundoApelido', 'SegundoApellido', 'Apelido2']));
    return {
      idPersoa: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Persoa', 'Row ID'])),
      nome: nome,
      primeiroApelido: apelido1,
      segundoApelido: apelido2,
      nomeCompleto: [nome, apelido1, apelido2].filter(Boolean).join(' '),
      voz: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Voz']))
    };
  });

  var ensaiosOut = ensaios.map(function (row) {
    var concerto = textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Concerto']));
    return {
      idEnsaio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Ensaio', 'IdEnsaio', 'Id'])),
      data: serializarDataEnsaiosPortal_(campoEnsaiosPortal_(row, ['Data'])),
      horaInicio: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['HoraInicio'])),
      horaFin: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['HoraFin'])),
      lugar: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Lugar'])),
      tipoEnsaio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['TipoEnsaio'])),
      concerto: concerto,
      concertoNome: concertosMap[concerto] || concerto,
      descricion: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Descricion', 'Descripción'])),
      observacions: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Observacions'])),
      cancelado: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Cancelado']))
    };
  });

  var asistenciasOut = asistencias.map(function (row) {
    return {
      idAsistenciaEnsaio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_AsistenciaEnsaio', 'Id'])),
      ensaio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Ensaio'])),
      persoa: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Persoa'])),
      estadoAsistencia: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['EstadoAsistencia'])),
      horaChegada: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['HoraChegada'])),
      horaSaida: serializarHoraEnsaiosPortal_(campoEnsaiosPortal_(row, ['HoraSaida'])),
      xustificada: booleanoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Xustificada'])),
      motivo: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Motivo'])),
      observacions: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Observacions']))
    };
  });

  var ensaiosRepOut = ensaiosRep.map(function (row) {
    return {
      idEnsaioRepertorio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_EnsaioRepertorio', 'Id'])),
      ensaio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Ensaio'])),
      repertorio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Repertorio'])),
      orde: campoEnsaiosPortal_(row, ['Orde']),
      tipoTraballo: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['TipoTraballo'])),
      desde: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Desde'])),
      ata: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Ata'])),
      observacions: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Observacions']))
    };
  });

  var repertorioOut = repertorio.map(function (row) {
    return {
      idRepertorio: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id', 'Id_Repertorio', 'Row ID'])),
      nomeObra: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['NomeObra', 'Nome', 'Obra'])),
      compositor: textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Compositor'])),
      audios: []
    };
  }).filter(function (row) { return row.idRepertorio && row.nomeObra; });

  return {
    ok: true,
    perfil: { email: email, nivel: permiso.nivel, cargo: permiso.cargo, podeEditar: permiso.escritura },
    ensaios: ensaiosOut,
    persoas: persoasOut,
    asistencias: asistenciasOut,
    ensaiosRepertorio: ensaiosRepOut,
    repertorio: repertorioOut,
    seguimento: calcularSeguimentoEnsaiosPortal_(ensaiosOut, persoasOut, asistenciasOut, ensaiosRepOut, repertorioOut, {}),
    xeradoEn: new Date().toISOString()
  };
}

function gardarAsistenciaEnsaioPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);
  if (!permiso.escritura) return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para modificar asistencias' };

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);
  var idPersoa = textoEnsaiosPortal_(datos && datos.idPersoa);
  var estado = textoEnsaiosPortal_(datos && datos.estadoAsistencia);
  var xustificada = datos && datos.xustificada === true;
  var motivo = textoEnsaiosPortal_(datos && datos.motivo);
  var observacions = textoEnsaiosPortal_(datos && datos.observacions);
  if (!idEnsaio || !idPersoa) return { ok: false, codigo: 'VALIDATION', erro: 'Faltan datos da asistencia' };

  var cfg = configuracionEnsaiosPortal_();
  var datosFolla = filasEnsaiosPortal_(cfg.asistenciasId, 'AsistenciasEnsaios');
  var headers = datosFolla.headers;
  var row = datosFolla.rows.find(function (item) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Ensaio'])) === idEnsaio &&
      textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Persoa'])) === idPersoa;
  });
  var valores = new Array(headers.length).fill('');
  function set(nomes, valor) { var i = indiceHeaderEnsaiosPortal_(headers, nomes); if (i >= 0) valores[i] = valor; }
  if (row) headers.forEach(function (header, i) { valores[i] = row[header]; });
  set(['Id_AsistenciaEnsaio', 'Id'], row ? campoEnsaiosPortal_(row, ['Id_AsistenciaEnsaio', 'Id']) : Utilities.getUuid());
  set(['Ensaio'], idEnsaio); set(['Persoa'], idPersoa); set(['EstadoAsistencia'], estado);
  set(['Xustificada'], xustificada); set(['Motivo'], motivo); set(['Observacions'], observacions);
  if (row) datosFolla.sheet.getRange(row.__row, 1, 1, headers.length).setValues([valores]); else datosFolla.sheet.appendRow(valores);
  SpreadsheetApp.flush();
  return { ok: true, resultado: { idEnsaio: idEnsaio, idPersoa: idPersoa, estadoAsistencia: estado } };
}

function gardarEnsaioRepertorioPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);
  if (!permiso.escritura) return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para modificar repertorio de ensaios' };

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);
  var idRepertorio = textoEnsaiosPortal_(datos && datos.idRepertorio);
  if (!idEnsaio || !idRepertorio) return { ok: false, codigo: 'VALIDATION', erro: 'Falta o ensaio ou a obra' };
  var cfg = configuracionEnsaiosPortal_();
  var datosFolla = filasEnsaiosPortal_(cfg.ensaiosRepertorioId, 'EnsaiosRepertorio');
  var headers = datosFolla.headers;
  var existente = datosFolla.rows.find(function (item) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Ensaio'])) === idEnsaio && textoEnsaiosPortal_(campoEnsaiosPortal_(item, ['Repertorio'])) === idRepertorio;
  });
  if (existente) return { ok: true, resultado: { idEnsaio: idEnsaio, idRepertorio: idRepertorio, xaExistia: true } };
  var valores = new Array(headers.length).fill('');
  function set(nomes, valor) { var i = indiceHeaderEnsaiosPortal_(headers, nomes); if (i >= 0) valores[i] = valor; }
  set(['Id_EnsaioRepertorio', 'Id'], Utilities.getUuid()); set(['Ensaio'], idEnsaio); set(['Repertorio'], idRepertorio);
  set(['TipoTraballo'], textoEnsaiosPortal_(datos && datos.tipoTraballo)); set(['Desde'], textoEnsaiosPortal_(datos && datos.desde));
  set(['Ata'], textoEnsaiosPortal_(datos && datos.ata)); set(['Observacions'], textoEnsaiosPortal_(datos && datos.observacions));
  datosFolla.sheet.appendRow(valores); SpreadsheetApp.flush();
  return { ok: true, resultado: { idEnsaio: idEnsaio, idRepertorio: idRepertorio, xaExistia: false } };
}

function calcularSeguimentoEnsaiosPortal_(ensaios, persoas, asistencias, ensaiosRep, repertorio, filtros) {
  filtros = filtros || {};
  var desde = textoEnsaiosPortal_(filtros.desde);
  var ata = textoEnsaiosPortal_(filtros.ata);
  var idPersoa = textoEnsaiosPortal_(filtros.idPersoa);
  var ensaiosFiltrados = ensaios.filter(function (ensaio) {
    if (ensaio.cancelado) return false;
    if (desde && ensaio.data < desde) return false;
    if (ata && ensaio.data > ata) return false;
    return true;
  });
  var ids = {}; ensaiosFiltrados.forEach(function (ensaio) { ids[ensaio.idEnsaio] = true; });
  var asistenciasFiltradas = asistencias.filter(function (a) { return ids[a.ensaio] && (!idPersoa || a.persoa === idPersoa); });
  var presentes = asistenciasFiltradas.filter(function (a) { return normalizarEnsaiosPortal_(a.estadoAsistencia).indexOf('asist') >= 0 || normalizarEnsaiosPortal_(a.estadoAsistencia) === 'si'; });
  var porEnsaio = ensaiosFiltrados.map(function (ensaio) {
    var lista = asistencias.filter(function (a) { return a.ensaio === ensaio.idEnsaio; });
    return { idEnsaio: ensaio.idEnsaio, data: ensaio.data, total: persoas.length, presentes: lista.filter(function (a) { return normalizarEnsaiosPortal_(a.estadoAsistencia).indexOf('asist') >= 0 || normalizarEnsaiosPortal_(a.estadoAsistencia) === 'si'; }).length };
  });
  var ranking = persoas.map(function (p) {
    var lista = asistencias.filter(function (a) { return ids[a.ensaio] && a.persoa === p.idPersoa; });
    var n = lista.filter(function (a) { return normalizarEnsaiosPortal_(a.estadoAsistencia).indexOf('asist') >= 0 || normalizarEnsaiosPortal_(a.estadoAsistencia) === 'si'; }).length;
    return { idPersoa: p.idPersoa, nomeCompleto: p.nomeCompleto, voz: p.voz, asistencias: n, totalEnsaios: ensaiosFiltrados.length, porcentaxe: ensaiosFiltrados.length ? Math.round(n * 1000 / ensaiosFiltrados.length) / 10 : 0 };
  }).sort(function (a, b) { return b.asistencias - a.asistencias || a.nomeCompleto.localeCompare(b.nomeCompleto); });
  var obras = ensaiosRep.filter(function (r) { return ids[r.ensaio]; }).map(function (r) { var obra = repertorio.find(function (o) { return o.idRepertorio === r.repertorio; }); return { idEnsaio: r.ensaio, idRepertorio: r.repertorio, obra: obra ? obra.nomeObra : r.repertorio, compositor: obra ? obra.compositor : '' }; });
  return { resumo: { ensaios: ensaiosFiltrados.length, persoas: persoas.length, rexistrosAsistencia: asistenciasFiltradas.length, presentes: presentes.length }, porEnsaio: porEnsaio, ranking: ranking, obras: obras };
}

function obterSeguimentoEnsaiosPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);
  if (!permiso.autorizado) return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado' };
  var base = listarEnsaiosPortal_({ email: email });
  if (!base.ok) return base;
  return { ok: true, seguimento: calcularSeguimentoEnsaiosPortal_(base.ensaios, base.persoas, base.asistencias, base.ensaiosRepertorio, base.repertorio, datos || {}) };
}
