/**
 * Complemento do Web App que xa atende o portal privado.
 * No doPost(e), tras validar WEB_WRITE_TOKEN, engadir:
 * if (datos.accion === 'subirFoto') return respostaJson_(subirFotoPortal_(datos));
 *
 * Propiedades: FOTOS_FOLDER_ID e, opcionalmente, FOTOS_NOTIFY_EMAIL.
 * A fila constrúese polos encabezados, polo que non depende da orde de Fotos.
 */
function subirFotoPortal_(datos) {
  var email = String(datos.email || '').trim().toLowerCase();
  var usuario = buscarUsuarioWebAutorizado_(email); // Reutilizar a función existente.
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

  var bytes = Utilities.base64Decode(String(datos.base64 || ''));
  if (bytes.length > 8 * 1024 * 1024) {
    return { ok: false, erro: 'A fotografía supera o máximo de 8 MB' };
  }

  var marca = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyyMMdd-HHmmss');
  var nome = String(datos.nomeFicheiro || 'foto')
    .replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120);
  var ficheiro = DriveApp.getFolderById(folderId)
    .createFile(Utilities.newBlob(bytes, tipo, marca + '-' + nome));
  var rowId = Utilities.getUuid();
  var agora = new Date();
  var folla = SpreadsheetApp.getActive().getSheetByName('Fotos');
  if (!folla) {
    ficheiro.setTrashed(true);
    return { ok: false, erro: 'Non se atopou a folla Fotos' };
  }

  var contexto = { rowId: rowId, ficheiro: ficheiro, datos: datos,
    email: email, agora: agora };
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
      '<p>Podes revisala na táboa Fotos de AppSheet.</p>'
  });
  return { ok: true, rowId: rowId,
    mensaxe: 'Fotografía recibida e pendente de revisión' };
}

function valorFoto_(cabeceira, c) {
  var clave = String(cabeceira || '').trim().toLowerCase()
    .replace(/[\s_-]+/g, '');
  var d = c.datos;
  var v = {
    rowid: c.rowId, foto: c.ficheiro.getUrl(), imaxe: c.ficheiro.getUrl(),
    imagen: c.ficheiro.getUrl(), arquivo: c.ficheiro.getUrl(),
    ficheiro: c.ficheiro.getUrl(), título: d.titulo, titulo: d.titulo,
    pédefoto: d.peFoto, pefoto: d.peFoto, piedefoto: d.peFoto,
    lugar: d.lugar, datafoto: d.dataFoto, fechafoto: d.dataFoto,
    autoría: d.autoria, autoria: d.autoria, autor: d.autoria,
    procedencia: d.procedencia, orixe: d.procedencia, origen: d.procedencia,
    estado: 'Pendente', estadorevision: 'Pendente', revisión: 'Pendente',
    revision: 'Pendente', publicar: false, publicada: false, visible: false,
    datasubida: c.agora, fechasubida: c.agora, dataalta: c.agora,
    subidapor: c.email, email: c.email, emailusuario: c.email,
    uidfirebase: String(d.uidFirebase || ''), dereitosconfirmados: true,
    derechosconfirmados: true
  };
  return Object.prototype.hasOwnProperty.call(v, clave) ? v[clave] : '';
}

function escaparHtmlFoto_(texto) {
  return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
