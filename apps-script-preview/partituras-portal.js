/*
 * Xestión de Partituras desde o Portal privado SCPP.
 * Fonte administrativa: folla Partituras_App do libro Partituras.
 * A consulta habitual da web NON pasa por esta folla; este módulo só atende escrituras puntuais.
 */

var PARTITURAS_PORTAL_SPREADSHEET_ID_ = '18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0';
var PARTITURAS_PORTAL_SHEET_ = 'Partituras_App';

function textoPartiturasPortal_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function normalizarHeaderPartiturasPortal_(valor) {
  return textoPartiturasPortal_(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function indiceHeaderPartiturasPortal_(headers, nomes) {
  var buscados = nomes.map(normalizarHeaderPartiturasPortal_);
  for (var i = 0; i < headers.length; i++) {
    if (buscados.indexOf(normalizarHeaderPartiturasPortal_(headers[i])) >= 0) return i;
  }
  return -1;
}

function follaPartiturasPortal_() {
  var ss = SpreadsheetApp.openById(PARTITURAS_PORTAL_SPREADSHEET_ID_);
  var sheet = ss.getSheetByName(PARTITURAS_PORTAL_SHEET_);
  if (!sheet) throw new Error('Non existe a folla Partituras_App');
  return sheet;
}

function booleanoPartiturasPortal_(valor) {
  return valor === true || ['Y', 'SI', 'SÍ', 'TRUE', '1'].indexOf(textoPartiturasPortal_(valor).toUpperCase()) >= 0;
}

function seguinteIdPartituraPortal_(values, headers) {
  var idx = indiceHeaderPartiturasPortal_(headers, ['Id_Partitura']);
  if (idx < 0) throw new Error('Falta a columna Id_Partitura');
  var maximo = 0;
  for (var i = 1; i < values.length; i++) {
    var numero = Number(values[i][idx]);
    if (isFinite(numero)) maximo = Math.max(maximo, Math.trunc(numero));
  }
  return String(maximo + 1);
}

function altaPartituraPortal_(datos) {
  var nome = textoPartiturasPortal_(datos && datos.Nomepartitura);
  var r2Key = textoPartiturasPortal_(datos && datos.R2Key);
  if (!nome) return { ok: false, codigo: 'VALIDATION', erro: 'O nome da partitura é obrigatorio' };
  if (!r2Key || r2Key.indexOf('partituras/') !== 0) {
    return { ok: false, codigo: 'VALIDATION', erro: 'A ruta R2 da partitura non é válida' };
  }

  var sheet = follaPartiturasPortal_();
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { ok: false, codigo: 'SCHEMA', erro: 'Partituras_App non ten cabeceiras' };
  var headers = values[0].map(textoPartiturasPortal_);
  var row = new Array(headers.length).fill('');

  function set(nomes, valor) {
    var idx = indiceHeaderPartiturasPortal_(headers, nomes);
    if (idx >= 0) row[idx] = valor;
  }

  var idPartitura = seguinteIdPartituraPortal_(values, headers);
  var rowId = Utilities.getUuid();

  set(['Row ID', 'RowID'], rowId);
  set(['Id_Partitura'], idPartitura);
  set(['Id_Repertorio'], textoPartiturasPortal_(datos.Id_Repertorio));
  set(['Nomepartitura'], nome);
  set(['Voz'], textoPartiturasPortal_(datos.Voz) || 'General');
  set(['Versión', 'Version'], textoPartiturasPortal_(datos['Versión']) || '1.0');
  set(['PDF'], textoPartiturasPortal_(datos.PDF));
  set(['Pública', 'Publica'], booleanoPartiturasPortal_(datos['Pública']) ? 'Y' : 'N');
  set(['Activa'], 'Y');
  set(['Observacións', 'Observacions'], textoPartiturasPortal_(datos['Observacións']));
  set(['TipoPartitura'], textoPartiturasPortal_(datos.TipoPartitura) || 'Coral');
  set(['Principal'], booleanoPartiturasPortal_(datos.Principal) ? 'Y' : 'N');
  set(['R2Key'], r2Key);
  set(['EstadoR2'], textoPartiturasPortal_(datos.EstadoR2) || 'Verificado');
  set(['DataSubidaR2'], textoPartiturasPortal_(datos.DataSubidaR2));
  set(['TamanoR2'], datos.TamanoR2 || '');
  set(['MimeType'], textoPartiturasPortal_(datos.MimeType) || 'application/pdf');
  set(['R2ETag'], textoPartiturasPortal_(datos.R2ETag));
  set(['R2SHA256'], textoPartiturasPortal_(datos.R2SHA256));

  sheet.appendRow(row);
  SpreadsheetApp.flush();
  return { ok: true, idPartitura: idPartitura, rowId: rowId };
}

function eliminarPartituraPortal_(datos) {
  var idPartitura = textoPartiturasPortal_(datos && (datos.idPartitura || datos.Id_Partitura));
  if (!idPartitura) return { ok: false, codigo: 'VALIDATION', erro: 'Falta Id_Partitura' };

  var sheet = follaPartiturasPortal_();
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { ok: false, codigo: 'SCHEMA', erro: 'Partituras_App non ten cabeceiras' };
  var headers = values[0].map(textoPartiturasPortal_);
  var idx = indiceHeaderPartiturasPortal_(headers, ['Id_Partitura']);
  if (idx < 0) return { ok: false, codigo: 'SCHEMA', erro: 'Falta a columna Id_Partitura' };

  var fila = -1;
  for (var i = 1; i < values.length; i++) {
    if (textoPartiturasPortal_(values[i][idx]) === idPartitura) {
      fila = i + 1;
      break;
    }
  }
  if (fila < 0) return { ok: false, codigo: 'NOT_FOUND', erro: 'Non se atopou a partitura indicada' };

  sheet.deleteRow(fila);
  SpreadsheetApp.flush();
  return { ok: true, idPartitura: idPartitura };
}
