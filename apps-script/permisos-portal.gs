/*
 * Resolución central de identidade institucional e permisos do Portal SCPP.
 *
 * Fonte primaria:
 *   - XuntaDirectiva
 *   - DireccionArtistica
 *
 * Durante a migración, Persoas.Cargo mantense como respaldo só cando non existe
 * ningún rexistro de gobernanza para a persoa ou cando unha das follas novas non
 * se pode ler. Se xa existe un rexistro de gobernanza (aínda que estea inactivo),
 * non se recuperan permisos desde un Cargo antigo.
 */

var PERMISOS_PORTAL_CONFIG_ = {
  previewScriptId: '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF',
  productionScriptId: '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV',
  preview: {
    persoasId: '1o45U0odJynzPXNTBhOm11_sko13Sat-_r0saZ0BjBEg',
    xuntaDirectivaId: '12Fmoc41qMDRgZvlLMdbstLGjz1MA63SNCa4QfMJB7QM',
    direccionArtisticaId: '1ZC83Dc79JI3lZklTFu9nnaHcNMUA5zPIZO5Qizepioc'
  },
  production: {
    persoasId: '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
    xuntaDirectivaId: '1zRKw66yA5zn1fmR4tlgZRtNZ4Gg5ezrDiF8oHzpUykc',
    direccionArtisticaId: '1X1wu0n2Mz-LKZzCDUp--P1V2GY5tIZztz7EwoXOfQII'
  }
};

function textoPermisosPortal_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function normalizarPermisosPortal_(valor) {
  return textoPermisosPortal_(valor)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function ambientePermisosPortal_() {
  var props = PropertiesService.getScriptProperties();
  var scriptId = '';
  try {
    scriptId = textoPermisosPortal_(ScriptApp.getScriptId());
  } catch (erroScriptId) {
    scriptId = '';
  }
  if (scriptId === PERMISOS_PORTAL_CONFIG_.previewScriptId) return 'preview';
  if (scriptId === PERMISOS_PORTAL_CONFIG_.productionScriptId) return 'production';

  var branch = textoPermisosPortal_(props.getProperty('GITHUB_BRANCH')).toLowerCase();
  var environment = textoPermisosPortal_(props.getProperty('SCPP_ENVIRONMENT')).toLowerCase();
  var persoasId = textoPermisosPortal_(props.getProperty('PERSOAS_SPREADSHEET_ID'));
  if (branch === 'preview' || environment === 'preview' || environment === 'test' || persoasId === PERMISOS_PORTAL_CONFIG_.preview.persoasId) return 'preview';
  return 'production';
}

function configuracionPermisosPortal_() {
  var props = PropertiesService.getScriptProperties();
  var ambiente = ambientePermisosPortal_();
  var defaults = PERMISOS_PORTAL_CONFIG_[ambiente];
  return {
    ambiente: ambiente,
    persoasId: textoPermisosPortal_(props.getProperty('PERSOAS_SPREADSHEET_ID')) || defaults.persoasId,
    xuntaDirectivaId: textoPermisosPortal_(props.getProperty('XUNTA_DIRECTIVA_SPREADSHEET_ID')) || defaults.xuntaDirectivaId,
    direccionArtisticaId: textoPermisosPortal_(props.getProperty('DIRECCION_ARTISTICA_SPREADSHEET_ID')) || defaults.direccionArtisticaId
  };
}

function filasPermisosPortal_(spreadsheetId, nomeEsperado) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(nomeEsperado) || ss.getSheets()[0];
  if (!sheet) throw new Error('Non existe ningunha folla en ' + nomeEsperado);
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values[0].map(textoPermisosPortal_);
  return values.slice(1).filter(function (row) {
    return row.some(function (cell) { return textoPermisosPortal_(cell) !== ''; });
  }).map(function (row) {
    var item = {};
    headers.forEach(function (header, index) { item[header] = row[index]; });
    return item;
  });
}

function campoPermisosPortal_(row, nomes) {
  var keys = Object.keys(row || {});
  for (var i = 0; i < nomes.length; i++) {
    var target = normalizarPermisosPortal_(nomes[i]);
    for (var j = 0; j < keys.length; j++) {
      if (normalizarPermisosPortal_(keys[j]) === target) return row[keys[j]];
    }
  }
  return '';
}

function persoaActivaPermisosPortal_(row) {
  var valor = normalizarPermisosPortal_(campoPermisosPortal_(row, ['Activo', 'Activa', 'Estado']));
  return ['baixa', 'baja', 'inactivo', 'inactiva', 'false', '0', 'n', 'non', 'no'].indexOf(valor) < 0;
}

function booleanoPermisosPortal_(valor) {
  if (valor === true) return true;
  return ['true', '1', 'si', 'sí', 'yes', 'y', 'x'].indexOf(textoPermisosPortal_(valor).toLowerCase()) >= 0;
}

function dataPermisosPortal_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) return valor;
  var texto = textoPermisosPortal_(valor);
  if (!texto) return null;
  var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
  var galega = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(texto);
  if (galega) return new Date(Number(galega[3]), Number(galega[2]) - 1, Number(galega[1]), 12, 0, 0, 0);
  return null;
}

function rexistroVixentePermisosPortal_(row) {
  if (!booleanoPermisosPortal_(campoPermisosPortal_(row, ['Activo']))) return false;
  var hoxe = new Date();
  hoxe.setHours(12, 0, 0, 0);
  var inicio = dataPermisosPortal_(campoPermisosPortal_(row, ['Data_Inicio', 'DataInicio']));
  var fin = dataPermisosPortal_(campoPermisosPortal_(row, ['Data_Fin', 'DataFin']));
  if (inicio && inicio > hoxe) return false;
  if (fin && fin < hoxe) return false;
  return true;
}

function permisoLegacyCargoPortal_(persoa, correo) {
  var cargoTexto = textoPermisosPortal_(campoPermisosPortal_(persoa, ['Cargo']));
  var cargo = normalizarPermisosPortal_(cargoTexto);
  var cargosXunta = ['presidente', 'vicepresidente', 'vicepresidenta', 'secretario', 'secretaria', 'vicesecretario', 'vicesecretaria', 'tesoureiro', 'tesoureira', 'tesorero', 'tesorera', 'contador', 'contadora', 'arquiveirobibliotecario', 'arquiveirabibliotecaria', 'vogal', 'vogais', 'vocal', 'vocales'];
  var escritura = cargosXunta.some(function (item) { return cargo === item || cargo.indexOf(item) === 0; });
  var direccion = cargo.indexOf('director') === 0 || cargo.indexOf('directora') === 0 || cargo.indexOf('direccion') === 0;
  return {
    autorizado: escritura || direccion,
    escritura: escritura,
    nivel: escritura ? 'Xunta Directiva' : (direccion ? 'Dirección artística' : ''),
    cargo: cargoTexto,
    funcion: direccion ? cargoTexto : '',
    perfis: escritura ? ['ADMINISTRACION'] : (direccion ? ['DIRECCION_ARTISTICA'] : []),
    fonte: 'Persoas.Cargo',
    email: correo
  };
}

function resolverPermisosPortal_(email) {
  var correo = textoPermisosPortal_(email).toLowerCase();
  if (!correo) return { autorizado: false, escritura: false, nivel: '', cargo: '', funcion: '', perfis: [], fonte: 'sen-email' };

  var cfg = configuracionPermisosPortal_();
  var persoas = filasPermisosPortal_(cfg.persoasId, 'Persoas');
  var persoa = persoas.find(function (row) {
    return textoPermisosPortal_(campoPermisosPortal_(row, ['Correo electrónico', 'CorreoElectronico', 'Email', 'Correo'])).toLowerCase() === correo;
  });
  if (!persoa || !persoaActivaPermisosPortal_(persoa)) {
    return { autorizado: false, escritura: false, nivel: '', cargo: '', funcion: '', perfis: [], fonte: 'Persoas', email: correo };
  }

  var rowId = textoPermisosPortal_(campoPermisosPortal_(persoa, ['Row ID', 'RowID']));
  if (!rowId) return permisoLegacyCargoPortal_(persoa, correo);

  var xunta = [];
  var direccion = [];
  var xuntaOk = true;
  var direccionOk = true;
  try {
    xunta = filasPermisosPortal_(cfg.xuntaDirectivaId, 'XuntaDirectiva');
  } catch (erroXunta) {
    xuntaOk = false;
    console.warn('Non se puido ler XuntaDirectiva para permisos: ' + String(erroXunta && erroXunta.message ? erroXunta.message : erroXunta));
  }
  try {
    direccion = filasPermisosPortal_(cfg.direccionArtisticaId, 'DireccionArtistica');
  } catch (erroDireccion) {
    direccionOk = false;
    console.warn('Non se puido ler DireccionArtistica para permisos: ' + String(erroDireccion && erroDireccion.message ? erroDireccion.message : erroDireccion));
  }

  var rexistrosXunta = xunta.filter(function (row) {
    return textoPermisosPortal_(campoPermisosPortal_(row, ['Persoa'])) === rowId;
  });
  var rexistrosDireccion = direccion.filter(function (row) {
    return textoPermisosPortal_(campoPermisosPortal_(row, ['Persoa'])) === rowId;
  });
  var existeGobernanza = rexistrosXunta.length > 0 || rexistrosDireccion.length > 0;

  var activosXunta = rexistrosXunta.filter(rexistroVixentePermisosPortal_);
  var activosDireccion = rexistrosDireccion.filter(rexistroVixentePermisosPortal_);
  var perfis = [];
  activosXunta.concat(activosDireccion).forEach(function (row) {
    var perfil = textoPermisosPortal_(campoPermisosPortal_(row, ['Perfil_Permisos', 'PerfilPermisos'])).toUpperCase();
    if (perfil && perfis.indexOf(perfil) < 0) perfis.push(perfil);
  });

  var escritura = perfis.indexOf('ADMINISTRACION') >= 0;
  var direccionArtistica = perfis.indexOf('DIRECCION_ARTISTICA') >= 0;
  var lectura = perfis.indexOf('LECTURA') >= 0;
  if (escritura || direccionArtistica || lectura) {
    var rexistroXunta = activosXunta[0] || null;
    var rexistroDireccion = activosDireccion[0] || null;
    return {
      autorizado: true,
      escritura: escritura,
      nivel: escritura ? 'Xunta Directiva' : (direccionArtistica ? 'Dirección artística' : 'Lectura'),
      cargo: rexistroXunta ? textoPermisosPortal_(campoPermisosPortal_(rexistroXunta, ['Cargo'])) : '',
      funcion: rexistroDireccion ? textoPermisosPortal_(campoPermisosPortal_(rexistroDireccion, ['Funcion', 'Función'])) : '',
      perfis: perfis,
      fonte: 'Gobernanza',
      email: correo,
      rowId: rowId
    };
  }

  // Un rexistro histórico/inactivo na nova gobernanza é unha denegación expresa:
  // non se debe reactivar un Cargo antigo desde Persoas.
  if (existeGobernanza && xuntaOk && direccionOk) {
    return { autorizado: false, escritura: false, nivel: '', cargo: '', funcion: '', perfis: [], fonte: 'Gobernanza', email: correo, rowId: rowId };
  }

  // Respaldo temporal durante a migración ou ante unha lectura incompleta.
  return permisoLegacyCargoPortal_(persoa, correo);
}
