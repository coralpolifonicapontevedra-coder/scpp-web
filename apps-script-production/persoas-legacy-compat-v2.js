/*
 * Compatibilidade temporal das accións históricas de Persoas.
 *
 * O módulo novo usa persoasV2*. As revisións públicas existentes continúan
 * chamando actualizarPersoaAdministracion e precisan rexistrar a aceptación
 * legal na folla real de Producción. Este ficheiro mantén ese contrato sen
 * duplicar o novo motor de alta/edición/estado.
 */

var PERSOAS_LEGACY_ACEPTACION_CONFIG_ = {
  aceptacionSpreadsheetId: '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k',
  aceptacionSheetId: 974695665,
  textosSheetId: 2025412208,
  usuariosSpreadsheetId: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  usuariosSheetName: 'UsuariosWeb'
};

function persoasLegacyTexto_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function persoasLegacyEmail_(valor) {
  return persoasLegacyTexto_(valor).toLowerCase();
}

function persoasLegacyBool_(valor) {
  if (valor === true) return true;
  return ['true','1','si','sí','yes','y','x'].indexOf(persoasLegacyTexto_(valor).toLowerCase()) >= 0;
}

function persoasLegacyIndices_(headers) {
  var out = {};
  (headers || []).forEach(function(header, index) {
    out[persoasLegacyTexto_(header)] = index;
  });
  return out;
}

function persoasLegacyRequire_(indices, header, sheet) {
  if (indices[header] === undefined) throw new Error('Falta a columna ' + header + ' na folla ' + sheet);
}

function persoasLegacyContextoAceptacion_() {
  var ss = SpreadsheetApp.openById(PERSOAS_LEGACY_ACEPTACION_CONFIG_.aceptacionSpreadsheetId);
  var aceptacion = ss.getSheetById(PERSOAS_LEGACY_ACEPTACION_CONFIG_.aceptacionSheetId);
  var textos = ss.getSheetById(PERSOAS_LEGACY_ACEPTACION_CONFIG_.textosSheetId);
  if (!aceptacion || !textos) throw new Error('Non se atoparon Aceptación/TextosLegais de Producción');
  return { aceptacion: aceptacion, textos: textos };
}

function persoasLegacyData_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) return valor;
  var text = persoasLegacyTexto_(valor);
  var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(text);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : null;
}

function persoasLegacyTextoLegalVersion_(idTexto, version) {
  var contexto = persoasLegacyContextoAceptacion_();
  var values = contexto.textos.getDataRange().getValues();
  if (values.length < 2) throw new Error('TextosLegais non contén textos');
  var ix = persoasLegacyIndices_(values[0]);
  ['Id','Version','Titulo','Texto','DataVixencia','Ambito'].forEach(function(header) {
    persoasLegacyRequire_(ix, header, 'TextosLegais');
  });
  var targetId = persoasLegacyTexto_(idTexto);
  var targetVersion = persoasLegacyTexto_(version);
  var row = values.slice(1).find(function(item) {
    var date = persoasLegacyData_(item[ix.DataVixencia]);
    return persoasLegacyTexto_(item[ix.Id]) === targetId
      && persoasLegacyTexto_(item[ix.Version]) === targetVersion
      && date && date.getTime() <= Date.now();
  });
  if (!row) throw new Error('Non se atopou a versión legal ' + targetVersion + ' para Persoas');
  return {
    id: persoasLegacyTexto_(row[ix.Id]),
    version: persoasLegacyTexto_(row[ix.Version]),
    titulo: persoasLegacyTexto_(row[ix.Titulo]),
    texto: persoasLegacyTexto_(row[ix.Texto]),
    ambito: persoasLegacyTexto_(row[ix.Ambito])
  };
}

function persoasLegacyValidarAceptacion_(entrada) {
  var value = entrada && typeof entrada === 'object' ? entrada : {};
  if (value.aceptaFines !== true) throw new Error('É necesario confirmar a aceptación do tratamento de datos');
  var idTexto = persoasLegacyTexto_(value.idTextoLegal);
  if (idTexto !== 'DATOS_PERSOA_SCPP') throw new Error('O texto legal indicado non corresponde á revisión de Persoas');
  var version = persoasLegacyTexto_(value.version);
  var revisionId = persoasLegacyTexto_(value.revisionId);
  var documento = persoasLegacyTexto_(value.documento);
  if (!version) throw new Error('Non se indicou a versión do texto legal');
  if (!/^[A-Za-z0-9-]{8,100}$/.test(revisionId)) throw new Error('O identificador da revisión non é válido');
  if (!/^persoas\/aceptacions\/[A-Za-z0-9_-]+\/aceptacion-[A-Za-z0-9_-]+\.pdf$/.test(documento)) {
    throw new Error('A ruta do documento de aceptación non é válida');
  }
  return {
    idTextoLegal: idTexto,
    version: version,
    revisionId: revisionId,
    documento: documento,
    xeradaPor: persoasLegacyEmail_(value.xeradaPor),
    textoLegal: persoasLegacyTextoLegalVersion_(idTexto, version)
  };
}

function persoasLegacyUsuarioWeb_(idPersoa, correo) {
  var ss = SpreadsheetApp.openById(PERSOAS_LEGACY_ACEPTACION_CONFIG_.usuariosSpreadsheetId);
  var sh = ss.getSheetByName(PERSOAS_LEGACY_ACEPTACION_CONFIG_.usuariosSheetName);
  if (!sh) return '';
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return '';
  var ix = persoasLegacyIndices_(values[0]);
  var row = values.slice(1).find(function(item) {
    var person = ix.Persoa === undefined ? '' : persoasLegacyTexto_(item[ix.Persoa]);
    var email = ix.Email === undefined ? '' : persoasLegacyEmail_(item[ix.Email]);
    var activo = ix.Activo === undefined ? true : persoasLegacyBool_(item[ix.Activo]);
    return activo && ((idPersoa && person === idPersoa) || (correo && email === correo));
  });
  if (!row) return '';
  return ix['Row ID'] === undefined ? '' : persoasLegacyTexto_(row[ix['Row ID']]);
}

function persoasLegacyRexistrarAceptacion_(datos, aceptacion) {
  var contexto = persoasLegacyContextoAceptacion_();
  var sh = contexto.aceptacion;
  var values = sh.getDataRange().getValues();
  if (!values.length) throw new Error('A folla Aceptación non ten cabeceiras');
  var ix = persoasLegacyIndices_(values[0]);
  [
    'Row ID','Correo electrónico','Fecha_Hora','Versión','Texto_Legal','Acepta_Fines',
    'Persoa','UsuarioWeb','Ambito','Canle','DataRetirada','TipoAceptacion','Estado','Documento'
  ].forEach(function(header) { persoasLegacyRequire_(ix, header, 'Aceptación'); });

  var idPersoa = persoasLegacyTexto_(datos && (datos.idPersoa || datos.id || datos.rowId));
  var persoa = datos && (datos.persoa || datos.datos) || {};
  var correo = persoasLegacyEmail_(persoa.correo);
  var existente = values.slice(1).find(function(row) {
    return persoasLegacyTexto_(row[ix.Persoa]) === idPersoa
      && persoasLegacyTexto_(row[ix.Documento]) === aceptacion.documento;
  });
  if (existente) {
    return {
      rowId: persoasLegacyTexto_(existente[ix['Row ID']]),
      version: persoasLegacyTexto_(existente[ix['Versión']]),
      documento: persoasLegacyTexto_(existente[ix.Documento]),
      revisionId: aceptacion.revisionId,
      existente: true
    };
  }

  var rowId = Utilities.getUuid();
  var row = new Array(values[0].length).fill('');
  function put(header, value) { row[ix[header]] = value; }
  put('Row ID', rowId);
  put('Correo electrónico', correo);
  put('Fecha_Hora', new Date());
  put('Versión', aceptacion.textoLegal.version);
  put('Texto_Legal', aceptacion.textoLegal.texto);
  put('Acepta_Fines', true);
  put('Persoa', idPersoa);
  put('UsuarioWeb', persoasLegacyUsuarioWeb_(idPersoa, correo));
  put('Ambito', aceptacion.textoLegal.ambito);
  put('Canle', 'Web · revisión de datos');
  put('DataRetirada', '');
  put('TipoAceptacion', 'Tratamento de datos persoais');
  put('Estado', 'Aceptada');
  put('Documento', aceptacion.documento);
  sh.appendRow(row);
  SpreadsheetApp.flush();
  return {
    rowId: rowId,
    version: aceptacion.textoLegal.version,
    documento: aceptacion.documento,
    revisionId: aceptacion.revisionId,
    existente: false
  };
}

function persoasLegacyEliminarAceptacion_(rowId) {
  var sh = persoasLegacyContextoAceptacion_().aceptacion;
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return;
  var ix = persoasLegacyIndices_(values[0]);
  var ref = persoasLegacyTexto_(rowId);
  for (var i = values.length - 1; i >= 1; i -= 1) {
    if (persoasLegacyTexto_(values[i][ix['Row ID']]) === ref) {
      sh.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return;
    }
  }
}

function crearPersoaAdministracion_(datos) {
  return persoasV2Crear_(datos);
}

function cambiarEstadoPersoaAdministracion_(datos) {
  return persoasV2Estado_(datos);
}

function actualizarPersoaAdministracion_(datos) {
  var aceptacionEntrada = datos && datos.aceptacion;
  if (!aceptacionEntrada) return persoasV2Actualizar_(datos);

  try {
    var aceptacion = persoasLegacyValidarAceptacion_(aceptacionEntrada);
    var rexistro = persoasLegacyRexistrarAceptacion_(datos, aceptacion);
    var copia = {};
    Object.keys(datos || {}).forEach(function(key) {
      if (key !== 'aceptacion') copia[key] = datos[key];
    });
    var result = persoasV2Actualizar_(copia);
    if (!result || result.ok !== true) {
      if (rexistro && rexistro.existente !== true) persoasLegacyEliminarAceptacion_(rexistro.rowId);
      return result || { ok:false, erro:'Non foi posible actualizar a persoa' };
    }
    result.aceptacion = rexistro;
    result.mensaxe = 'Datos e aceptación actualizados correctamente';
    return result;
  } catch (error) {
    return { ok:false, erro:String(error && error.message ? error.message : error) };
  }
}
