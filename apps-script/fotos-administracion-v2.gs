/*
 * Administración de Fotografías v2.
 *
 * Contrato novo e independente do módulo histórico de revisión:
 * - usa exclusivamente resolverPermisosPortal_ para autorizar;
 * - usa Id_Foto como clave estable;
 * - escribe metadatos, publicación e rutas R2 nunha única operación;
 * - non depende de UsuariosWeb, RevisarFotos nin funcións antigas de Fotos.
 */

function permisoFotosAdministracionV2_(email) {
  var correo = String(email || '').trim().toLowerCase();
  var permiso = resolverPermisosPortal_(correo);
  var perfis = Array.isArray(permiso && permiso.perfis) ? permiso.perfis : [];
  var administrador = permiso &&
    permiso.autorizado === true &&
    permiso.escritura === true &&
    perfis.map(function (perfil) { return String(perfil || '').trim().toUpperCase(); })
      .indexOf('ADMINISTRACION') !== -1;

  return {
    ok: administrador === true,
    administrador: administrador === true,
    email: correo,
    nivel: permiso && permiso.nivel ? String(permiso.nivel) : '',
    fonte: permiso && permiso.fonte ? String(permiso.fonte) : '',
    perfis: perfis
  };
}

function comprobarFotosAdministracionPortal_(datos) {
  var resultado = permisoFotosAdministracionV2_(datos && datos.email);
  if (!resultado.ok) {
    return { ok: false, erro: 'Administración non autorizada', administrador: false };
  }
  return resultado;
}

function contextoFotosAdministracionV2_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = String(props.getProperty('FOTOS_SPREADSHEET_ID') || '').trim();
  var sheetId = Number(props.getProperty('FOTOS_SHEET_ID'));
  if (!spreadsheetId || !sheetId) {
    throw new Error('Falta a configuración FOTOS_SPREADSHEET_ID/FOTOS_SHEET_ID');
  }

  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetById(sheetId);
  if (!sheet || sheet.getName() !== 'Fotos') {
    throw new Error('Non se atopou a folla Fotos configurada');
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (valor) { return String(valor || '').trim(); });
  var index = {};
  headers.forEach(function (header, i) { index[header] = i; });

  ['Id_Foto', 'Titulo', 'PeFoto', 'EstadoRevision', 'Publicar_Publica',
    'Publicar_Privada', 'Observacions', 'RutaR2_Publica', 'RutaR2_Privada']
    .forEach(function (header) {
      if (typeof index[header] !== 'number') {
        throw new Error('Falta a columna ' + header + ' na folla Fotos');
      }
    });

  return { sheet: sheet, index: index };
}

function valorBooleanoFotosAdministracionV2_(valor) {
  if (valor === true) return true;
  return ['true', '1', 'si', 'sí', 'yes', 'x']
    .indexOf(String(valor || '').trim().toLowerCase()) !== -1;
}

function gardarCampoFotosAdministracionV2_(sheet, row, index, header, value) {
  if (typeof index[header] !== 'number') return;
  sheet.getRange(row, index[header] + 1).setValue(value);
}

function gardarFotoAdministracionPortal_(datos) {
  datos = datos || {};
  var permiso = permisoFotosAdministracionV2_(datos.email);
  if (!permiso.ok) {
    return { ok: false, erro: 'Administración non autorizada' };
  }

  var idFoto = String(datos.idFoto || '').trim();
  if (!idFoto) return { ok: false, erro: 'Falta o identificador da fotografía' };

  var contexto = contextoFotosAdministracionV2_();
  var sheet = contexto.sheet;
  var index = contexto.index;
  var values = sheet.getDataRange().getValues();
  var rowIndex = values.findIndex(function (row, i) {
    return i > 0 && String(row[index.Id_Foto] || '').trim() === idFoto;
  });
  if (rowIndex === -1) return { ok: false, erro: 'Non se atopou a fotografía' };

  var rowNumber = rowIndex + 1;
  var publicarPublica = datos.publicarPublica === true;
  var publicarPrivada = datos.publicarPrivada === true;
  var destacadaPublica = publicarPublica && datos.destacadaPublica === true;
  var destacadaPrivada = publicarPrivada && datos.destacadaPrivada === true;
  var agora = new Date();

  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Titulo', String(datos.titulo || '').trim());
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'PeFoto', String(datos.peFoto || '').trim());
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Observacions', String(datos.observacions || '').trim());
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'EstadoRevision', 'Aprobada');
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Publicar_Publica', publicarPublica);
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Publicar_Privada', publicarPrivada);
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Destacada_Publica', destacadaPublica);
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Destacada_Privada', destacadaPrivada);
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Data_Revision', agora);
  gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Revisada_Por', permiso.email);

  var rutaPublica = String(datos.rutaR2Publica || '').trim();
  var rutaPrivada = String(datos.rutaR2Privada || '').trim();
  if (rutaPublica) {
    gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'RutaR2_Publica', rutaPublica);
  }
  if (rutaPrivada) {
    gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'RutaR2_Privada', rutaPrivada);
  }

  if (publicarPublica) {
    gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Data_Publicacion_Publica', agora);
  }
  if (publicarPrivada) {
    gardarCampoFotosAdministracionV2_(sheet, rowNumber, index, 'Data_Publicacion_Privada', agora);
  }

  SpreadsheetApp.flush();

  var rowAfter = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  var publicaAfter = valorBooleanoFotosAdministracionV2_(rowAfter[index.Publicar_Publica]);
  var privadaAfter = valorBooleanoFotosAdministracionV2_(rowAfter[index.Publicar_Privada]);
  if (publicaAfter !== publicarPublica || privadaAfter !== publicarPrivada) {
    return { ok: false, erro: 'A verificación da publicación na Sheet non coincide co solicitado' };
  }

  return {
    ok: true,
    idFoto: idFoto,
    publicarPublica: publicaAfter,
    publicarPrivada: privadaAfter,
    titulo: String(rowAfter[index.Titulo] || '').trim(),
    peFoto: String(rowAfter[index.PeFoto] || '').trim(),
    observacions: String(rowAfter[index.Observacions] || '').trim(),
    estadoRevision: String(rowAfter[index.EstadoRevision] || '').trim(),
    rutaR2Publica: String(rowAfter[index.RutaR2_Publica] || '').trim(),
    rutaR2Privada: String(rowAfter[index.RutaR2_Privada] || '').trim(),
    permisoFonte: permiso.fonte,
    mensaxe: 'Fotografía gardada e verificada coa autorización central de Administración'
  };
}
