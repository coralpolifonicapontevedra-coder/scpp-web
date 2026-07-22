/**
 * Complemento do Web App que xa atende o portal privado.
 * No doPost(e), tras validar WEB_WRITE_TOKEN e antes do bloque
 * `if (datos.accion !== 'actualizarObservacions')`, engadir:
 *
 * if (datos.accion === 'subirFoto') {
 *   bloqueo.waitLock(10000);
 *   const resultadoFoto = subirFotoPortal_(datos);
 *   return respostaJSON(resultadoFoto);
 * }
 *
 * Propiedades: FOTOS_FOLDER_ID e, opcionalmente, FOTOS_NOTIFY_EMAIL e
 * FOTOS_APPSHEET_PATH (por defecto: Fotos_Images/).
 * A fila constrúese polos encabezados, polo que non depende da orde de Fotos.
 */
function configurarFotosPortal() {
  PropertiesService.getScriptProperties().setProperties({
    FOTOS_FOLDER_ID: '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix',
    FOTOS_SPREADSHEET_ID: '1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w',
    FOTOS_APPSHEET_PATH: 'Fotos_Images/',
    FOTOS_NOTIFY_EMAIL: 'coralpolifonicapontevedra@gmail.com'
  });

  var carpeta = DriveApp.getFolderById(
    '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix'
  );
  console.log('Configuración creada para a carpeta: ' + carpeta.getName());
}

function subirFotoPortal_(datos) {
  var email = String(datos.email || '').trim().toLowerCase();
  var usuario = obterUsuarioWebPorEmail(email);
  if (!usuario) return { ok: false, erro: 'Usuario non autorizado' };
  if (datos.confirmaDereitos !== true) {
    return { ok: false, erro: 'É necesario confirmar os dereitos da imaxe' };
  }

  var tipo = String(datos.tipo || '').toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(tipo) === -1) {
    return { ok: false, erro: 'Formato de imaxe non compatible' };
  }

  var propiedades = PropertiesService.getScriptProperties();
  var folderId = propiedades.getProperty('FOTOS_FOLDER_ID');
  if (!folderId) return { ok: false, erro: 'Falta configurar FOTOS_FOLDER_ID' };
  var spreadsheetId = propiedades.getProperty('FOTOS_SPREADSHEET_ID');
  if (!spreadsheetId) {
    return { ok: false, erro: 'Falta configurar FOTOS_SPREADSHEET_ID' };
  }

  var bytes = Utilities.base64Decode(String(datos.base64 || ''));
  if (bytes.length > 8 * 1024 * 1024) {
    return { ok: false, erro: 'A fotografía supera o máximo de 8 MB' };
  }

  var marca = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyyMMdd-HHmmss');
  var nome = String(datos.nomeFicheiro || 'foto')
    .replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120);
  var ficheiro = DriveApp.getFolderById(folderId)
    .createFile(Utilities.newBlob(bytes, tipo, marca + '-' + nome));
  var rutaAppSheet = String(
    propiedades.getProperty('FOTOS_APPSHEET_PATH') || 'Fotos_Images/'
  ).replace(/\/+$/, '') + '/' + ficheiro.getName();
  var rowId = Utilities.getUuid();
  var agora = new Date();
  var folla = SpreadsheetApp.openById(spreadsheetId).getSheetByName('Fotos');
  if (!folla) {
    ficheiro.setTrashed(true);
    return { ok: false, erro: 'Non se atopou a folla Fotos' };
  }

  var contexto = { rowId: rowId, ficheiro: ficheiro,
    rutaAppSheet: rutaAppSheet, datos: datos, email: email, agora: agora };
  var cabeceiras = folla.getRange(1, 1, 1, folla.getLastColumn()).getDisplayValues()[0];
  folla.appendRow(cabeceiras.map(function(c) { return valorFoto_(c, contexto); }));

  MailApp.sendEmail({
    to: propiedades.getProperty('FOTOS_NOTIFY_EMAIL') ||
      'coralpolifonicapontevedra@gmail.com',
    subject: 'Nova fotografía pendente de revisión',
    htmlBody: '<p>Recibiuse unha nova fotografía desde o portal privado.</p>' +
      '<p><strong>Título:</strong> ' + escaparHtmlFoto_(datos.titulo) + '<br>' +
      '<strong>Enviada por:</strong> ' + escaparHtmlFoto_(email) + '<br>' +
      '<strong>Identificador:</strong> ' + escaparHtmlFoto_(rowId) + '</p>' +
      '<p><a href="' + ficheiro.getUrl() + '">Abrir a imaxe en Drive</a></p>' +
      '<p>Podes revisala na táboa Fotos de AppSheet.</p>'
  });
  return { ok: true, rowId: rowId,
    mensaxe: 'Fotografía recibida e pendente de revisión' };
}

function valorFoto_(cabeceira, c) {
  var clave = String(cabeceira || '').trim();
  var d = c.datos;
  var v = {
    'Row ID': c.rowId,
    'Id_Foto': c.rowId,
    'Foto': c.rutaAppSheet,
    'Titulo': d.titulo,
    'Data': d.dataFoto,
    'AnoAproximado': d.anoAproximado ||
      (d.dataFoto ? String(d.dataFoto).substring(0, 4) : ''),
    'Lugar': d.lugar,
    'Concerto': d.concerto,
    'Evento': d.evento,
    'PeFoto': d.peFoto,
    'Autor': d.autoria,
    'Procedencia': d.procedencia,
    'DereitosUso': 'Confirmados pola persoa remitente',
    'EstadoRevision': 'Pendente',
    'MostrarWeb': false,
    'Destacada': false,
    'Calidade': '',
    'Observacions': '',
    'DataSubida': c.agora,
    'SubidaPor': c.email
  };
  return Object.prototype.hasOwnProperty.call(v, clave) ? v[clave] : '';
}

function escaparHtmlFoto_(texto) {
  return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
