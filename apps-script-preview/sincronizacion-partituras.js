/* Xestión de marcas de sincronización partitura/audio desde Administración. */

function configuracionSincronizacionPartituras_() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty('SINCRONIZACION_PARTITURAS_SPREADSHEET_ID') || '').trim();
  // Fallback exclusivo do ambiente PREVIEW. Antes de pasar a produción debe existir a propiedade.
  if (!id) id = '1h-ytA7nu5gtvryEN8Pqra3CtVhv_HYDXQ6PuvRsVuAA';
  return { spreadsheetId: id, sheetName: 'SincronizacionPartituras' };
}

function permisoSincronizacionPartituras_(email) {
  var correo = String(email || '').trim().toLowerCase();
  if (!correo) return { escritura: false, nivel: '' };
  try {
    var permiso = resolverPermisosPortal_(correo);
    return {
      escritura: !!(permiso && permiso.escritura),
      nivel: String((permiso && permiso.nivel) || '')
    };
  } catch (erro) {
    return { escritura: false, nivel: '' };
  }
}

function abrirSincronizacionPartituras_() {
  var cfg = configuracionSincronizacionPartituras_();
  var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  var sheet = ss.getSheetByName(cfg.sheetName) || ss.getSheets()[0];
  if (!sheet) throw new Error('Non existe a folla SincronizacionPartituras');
  return { cfg: cfg, ss: ss, sheet: sheet };
}

function textoSincronizacion_(valor) {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

function numeroSincronizacion_(valor) {
  var numero = Number(String(valor === null || valor === undefined ? '' : valor).replace(',', '.'));
  return isFinite(numero) ? numero : NaN;
}

function cabeceirasSincronizacion_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 9);
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(textoSincronizacion_);
}

function indiceSincronizacion_(headers, nome) {
  return headers.indexOf(nome);
}

function lerMarcasSincronizacion_() {
  var aberto = abrirSincronizacionPartituras_();
  var sheet = aberto.sheet;
  var lastRow = sheet.getLastRow();
  var headers = cabeceirasSincronizacion_(sheet);
  if (lastRow < 2) return { sheet: sheet, headers: headers, rows: [] };
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = values.map(function(row, index) {
    var out = { __row: index + 2 };
    headers.forEach(function(header, i) { if (header) out[header] = row[i]; });
    return out;
  }).filter(function(row) { return textoSincronizacion_(row.Id_Sincronizacion); });
  return { sheet: sheet, headers: headers, rows: rows };
}

function serializarMarcaSincronizacion_(row) {
  return {
    idSincronizacion: textoSincronizacion_(row.Id_Sincronizacion),
    idRepertorio: textoSincronizacion_(row.Id_Repertorio),
    idAudio: textoSincronizacion_(row.Id_Audio),
    voz: textoSincronizacion_(row.Voz),
    pagina: Number(row.Pagina || 0),
    segundo: Number(row.Segundo || 0),
    orde: Number(row.Orde || 0),
    observacions: textoSincronizacion_(row.Observacions),
    activo: row.Activo === true || String(row.Activo).toUpperCase() === 'TRUE' || String(row.Activo).toUpperCase() === 'Y'
  };
}

function listarSincronizacionPartiturasPortal_(datos) {
  var email = textoSincronizacion_(datos && (datos.email || datos.correo)).toLowerCase();
  var permiso = permisoSincronizacionPartituras_(email);
  if (!permiso.escritura) return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para administrar sincronizacións' };
  var idRepertorio = textoSincronizacion_(datos && datos.idRepertorio);
  var idAudio = textoSincronizacion_(datos && datos.idAudio);
  var table = lerMarcasSincronizacion_();
  var marcas = table.rows.filter(function(row) {
    if (idRepertorio && textoSincronizacion_(row.Id_Repertorio) !== idRepertorio) return false;
    if (idAudio && textoSincronizacion_(row.Id_Audio) !== idAudio) return false;
    return true;
  }).map(serializarMarcaSincronizacion_);
  marcas.sort(function(a, b) { return (a.segundo - b.segundo) || (a.orde - b.orde); });
  return { ok: true, nivel: permiso.nivel, marcas: marcas };
}

function gardarSincronizacionPartiturasPortal_(datos) {
  var email = textoSincronizacion_(datos && (datos.email || datos.correo)).toLowerCase();
  var permiso = permisoSincronizacionPartituras_(email);
  if (!permiso.escritura) return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para administrar sincronizacións' };

  var idRepertorio = textoSincronizacion_(datos && datos.idRepertorio);
  var idAudio = textoSincronizacion_(datos && datos.idAudio);
  var voz = textoSincronizacion_(datos && datos.voz);
  var pagina = numeroSincronizacion_(datos && datos.pagina);
  var segundo = numeroSincronizacion_(datos && datos.segundo);
  var orde = numeroSincronizacion_(datos && datos.orde);
  var observacions = textoSincronizacion_(datos && datos.observacions);
  var idSincronizacion = textoSincronizacion_(datos && datos.idSincronizacion) || Utilities.getUuid();

  if (!idRepertorio || !idAudio) return { ok: false, codigo: 'VALIDATION', erro: 'Faltan a obra ou o audio' };
  if (!isFinite(pagina) || pagina < 1) return { ok: false, codigo: 'VALIDATION', erro: 'A páxina debe ser maior ou igual a 1' };
  if (!isFinite(segundo) || segundo < 0) return { ok: false, codigo: 'VALIDATION', erro: 'O segundo non é válido' };
  if (!isFinite(orde) || orde < 1) return { ok: false, codigo: 'VALIDATION', erro: 'A orde debe ser maior ou igual a 1' };

  var table = lerMarcasSincronizacion_();
  var headers = table.headers;
  var required = ['Id_Sincronizacion','Id_Repertorio','Id_Audio','Voz','Pagina','Segundo','Orde','Observacions','Activo'];
  required.forEach(function(nome) { if (indiceSincronizacion_(headers, nome) < 0) throw new Error('Falta a columna '+nome+' en SincronizacionPartituras'); });

  var existente = table.rows.find(function(row) { return textoSincronizacion_(row.Id_Sincronizacion) === idSincronizacion; });
  var rowValues = new Array(headers.length).fill('');
  var valores = {
    Id_Sincronizacion: idSincronizacion,
    Id_Repertorio: idRepertorio,
    Id_Audio: idAudio,
    Voz: voz,
    Pagina: Math.trunc(pagina),
    Segundo: Math.round(segundo * 100) / 100,
    Orde: Math.trunc(orde),
    Observacions: observacions,
    Activo: datos && datos.activo === false ? false : true
  };
  Object.keys(valores).forEach(function(nome) { rowValues[indiceSincronizacion_(headers, nome)] = valores[nome]; });

  if (existente) table.sheet.getRange(existente.__row, 1, 1, headers.length).setValues([rowValues]);
  else table.sheet.appendRow(rowValues);
  SpreadsheetApp.flush();

  return { ok: true, marca: serializarMarcaSincronizacion_(valores), actualizadoPor: email };
}

function eliminarSincronizacionPartiturasPortal_(datos) {
  var email = textoSincronizacion_(datos && (datos.email || datos.correo)).toLowerCase();
  var permiso = permisoSincronizacionPartituras_(email);
  if (!permiso.escritura) return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para administrar sincronizacións' };
  var id = textoSincronizacion_(datos && datos.idSincronizacion);
  if (!id) return { ok: false, codigo: 'VALIDATION', erro: 'Falta o identificador da marca' };
  var table = lerMarcasSincronizacion_();
  var row = table.rows.find(function(item) { return textoSincronizacion_(item.Id_Sincronizacion) === id; });
  if (!row) return { ok: false, codigo: 'NOT_FOUND', erro: 'Non se atopou a marca indicada' };
  table.sheet.deleteRow(row.__row);
  SpreadsheetApp.flush();
  return { ok: true, idSincronizacion: id, eliminadoPor: email };
}
