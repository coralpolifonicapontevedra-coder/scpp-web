/**
 * Documentos privados dos concertos no Portal do Coralista.
 * Código común para Preview e Produción: os destinos configúranse con Script Properties.
 */
function obterDocumentoConcerto_(datos) {
  datos = datos || {};
  var email = limparConcertosPortal_(datos.email, 160).toLowerCase();
  var concertoId = limparConcertosPortal_(datos.concertoId, 120);
  if (!email) return { ok: false, erro: 'Falta o correo da persoa usuaria' };
  if (!concertoId) return { ok: false, erro: 'Falta identificar o concerto' };

  var contexto = obterContextoConcertosPortal_();
  if (!usuarioActivoConcertosPortal_(contexto, email)) return { ok: false, erro: 'Usuario non autorizado' };

  var documento = obterProgramaManConcerto_(contexto, concertoId);
  if (!documento.ruta) return { ok: false, erro: documento.erro || 'Este concerto non ten programa de man incorporado' };

  var ficheiro = localizarFicheiroConcerto_(contexto, documento.ruta);
  if (!ficheiro) return { ok: false, erro: 'O programa de man rexistrado non se atopou no Drive' };

  var mimeType = String(ficheiro.getMimeType() || '').toLowerCase();
  if (['application/pdf','image/jpeg','image/png','image/webp'].indexOf(mimeType) === -1) {
    return { ok: false, erro: 'O formato do programa de man non é compatible' };
  }
  var blob = ficheiro.getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > 8 * 1024 * 1024) return { ok: false, erro: 'O programa de man é demasiado grande para consultalo desde o Portal' };
  return { ok: true, nomeFicheiro: ficheiro.getName(), mimeType: mimeType, base64: Utilities.base64Encode(bytes) };
}

function obterContextoConcertosPortal_() {
  var p = PropertiesService.getScriptProperties();
  var concertosSpreadsheetId = p.getProperty('CONCERTOS_PORTAL_SPREADSHEET_ID');
  var concertosSheetId = Number(p.getProperty('CONCERTOS_PORTAL_SHEET_ID'));
  var usuariosSpreadsheetId = p.getProperty('CONCERTOS_PORTAL_USUARIOS_SPREADSHEET_ID');
  var usuariosSheetId = Number(p.getProperty('CONCERTOS_PORTAL_USUARIOS_SHEET_ID'));
  var filesFolderId = p.getProperty('CONCERTOS_PORTAL_FILES_FOLDER_ID');
  var imagesFolderId = p.getProperty('CONCERTOS_PORTAL_IMAGES_FOLDER_ID');
  if (!concertosSpreadsheetId || !concertosSheetId || !usuariosSpreadsheetId || !usuariosSheetId || !filesFolderId || !imagesFolderId) {
    throw new Error('Falta configurar o módulo Concertos mediante Script Properties');
  }
  var follaConcertos = SpreadsheetApp.openById(concertosSpreadsheetId).getSheetById(concertosSheetId);
  var follaUsuarios = SpreadsheetApp.openById(usuariosSpreadsheetId).getSheetById(usuariosSheetId);
  if (!follaConcertos || follaConcertos.getName() !== 'Concertos') throw new Error('Non se atopou a folla Concertos configurada');
  if (!follaUsuarios || follaUsuarios.getName() !== 'UsuariosWeb') throw new Error('Non se atopou a folla UsuariosWeb configurada');
  return { follaConcertos: follaConcertos, follaUsuarios: follaUsuarios, carpetaFiles: DriveApp.getFolderById(filesFolderId), carpetaImages: DriveApp.getFolderById(imagesFolderId) };
}

function usuarioActivoConcertosPortal_(contexto, email) {
  var valores = contexto.follaUsuarios.getDataRange().getValues();
  if (valores.length < 2) return false;
  var indices = crearIndicesConcertosPortal_(valores[0].map(function(v){ return String(v || '').trim(); }));
  if (indices.Email === undefined || indices.Activo === undefined) throw new Error('Faltan as columnas Email ou Activo en UsuariosWeb');
  for (var i = 1; i < valores.length; i += 1) {
    if (String(valores[i][indices.Email] || '').trim().toLowerCase() === email && valorBooleanoConcertosPortal_(valores[i][indices.Activo])) return true;
  }
  return false;
}

function obterProgramaManConcerto_(contexto, concertoId) {
  var valores = contexto.follaConcertos.getDataRange().getValues();
  if (valores.length < 2) return { ruta: '' };
  var indices = crearIndicesConcertosPortal_(valores[0].map(function(v){ return String(v || '').trim(); }));
  if (indices.Id === undefined || indices.Triptico === undefined) throw new Error('Faltan as columnas Id ou Triptico en Concertos');
  for (var i = 1; i < valores.length; i += 1) {
    var id = String(valores[i][indices.Id] || '').trim();
    var rowId = indices['Row ID'] === undefined ? '' : String(valores[i][indices['Row ID']] || '').trim();
    if (id === concertoId || rowId === concertoId) return { ruta: String(valores[i][indices.Triptico] || '').trim() };
  }
  return { ruta: '', erro: 'Non se atopou o concerto indicado' };
}

function localizarFicheiroConcerto_(contexto, ruta) {
  var partes = String(ruta || '').replace(/\\/g, '/').replace(/^\/+/, '').trim().split('/').filter(Boolean);
  if (partes.length !== 2) return null;
  var nomeCarpeta = partes[0], nomeFicheiro = partes[1];
  if (!nomeFicheiro || nomeFicheiro === '.' || nomeFicheiro === '..' || /[\/\\]/.test(nomeFicheiro)) return null;
  var carpeta = nomeCarpeta === 'Concertos_Files_' ? contexto.carpetaFiles : nomeCarpeta === 'Concertos_Images' ? contexto.carpetaImages : null;
  if (!carpeta) return null;
  var ficheiros = carpeta.getFilesByName(nomeFicheiro);
  return ficheiros.hasNext() ? ficheiros.next() : null;
}

function crearIndicesConcertosPortal_(cabeceiras) {
  var indices = {};
  cabeceiras.forEach(function(nome, indice){ indices[String(nome || '').trim()] = indice; });
  return indices;
}
function valorBooleanoConcertosPortal_(valor) {
  if (valor === true) return true;
  return ['true','verdadero','verdadeiro','si','sí','yes','1'].indexOf(String(valor || '').trim().toLowerCase()) !== -1;
}
function limparConcertosPortal_(valor, maximo) { return String(valor == null ? '' : valor).trim().slice(0, maximo || 5000); }
