/*
 * Administración de Fotografías v2 - Producción.
 *
 * Contrato independente do módulo histórico de revisión:
 * - usa exclusivamente resolverPermisosPortal_ para autorizar;
 * - usa Id_Foto como clave estable;
 * - escribe metadatos, publicación e rutas R2 nunha única operación;
 * - non depende do sistema histórico de autorización de Fotografías.
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

function asignarFotoAdministracionV2_(row, index, header, value) {
  if (typeof index[header] === 'number') row[index[header]] = value;
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
  var row = values[rowIndex].slice();
  var publicarPublica = datos.publicarPublica === true;
  var publicarPrivada = datos.publicarPrivada === true;
  var destacadaPublica = publicarPublica && datos.destacadaPublica === true;
  var destacadaPrivada = publicarPrivada && datos.destacadaPrivada === true;
  var agora = new Date();

  asignarFotoAdministracionV2_(row, index, 'Titulo', String(datos.titulo || '').trim());
  asignarFotoAdministracionV2_(row, index, 'PeFoto', String(datos.peFoto || '').trim());
  asignarFotoAdministracionV2_(row, index, 'Observacions', String(datos.observacions || '').trim());
  asignarFotoAdministracionV2_(row, index, 'EstadoRevision', 'Aprobada');
  asignarFotoAdministracionV2_(row, index, 'Publicar_Publica', publicarPublica);
  asignarFotoAdministracionV2_(row, index, 'Publicar_Privada', publicarPrivada);
  asignarFotoAdministracionV2_(row, index, 'Destacada_Publica', destacadaPublica);
  asignarFotoAdministracionV2_(row, index, 'Destacada_Privada', destacadaPrivada);
  asignarFotoAdministracionV2_(row, index, 'Data_Revision', agora);
  asignarFotoAdministracionV2_(row, index, 'Revisada_Por', permiso.email);

  var rutaPublica = String(datos.rutaR2Publica || '').trim();
  var rutaPrivada = String(datos.rutaR2Privada || '').trim();
  if (rutaPublica) asignarFotoAdministracionV2_(row, index, 'RutaR2_Publica', rutaPublica);
  if (rutaPrivada) asignarFotoAdministracionV2_(row, index, 'RutaR2_Privada', rutaPrivada);

  if (publicarPublica) asignarFotoAdministracionV2_(row, index, 'Data_Publicacion_Publica', agora);
  if (publicarPrivada) asignarFotoAdministracionV2_(row, index, 'Data_Publicacion_Privada', agora);

  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  SpreadsheetApp.flush();

  var rowAfter = sheet.getRange(rowNumber, 1, 1, row.length).getValues()[0];
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
    entorno: 'production',
    mensaxe: 'Fotografía gardada e verificada coa autorización central de Administración'
  };
}

/* Garda física de Producción: un Web App mal configurado non pode borrar fóra destes recursos. */
var FOTOS_PRODUCTION_SPREADSHEET_ID_V2_ = '1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w';
var FOTOS_PRODUCTION_FOLDER_ID_V2_ = '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix';

function validarEntornoEliminacionFotosV2_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = String(props.getProperty('FOTOS_SPREADSHEET_ID') || '').trim();
  var folderId = String(props.getProperty('FOTOS_FOLDER_ID') || '').trim();
  if (spreadsheetId !== FOTOS_PRODUCTION_SPREADSHEET_ID_V2_ || folderId !== FOTOS_PRODUCTION_FOLDER_ID_V2_) {
    return {
      ok: false,
      codigo: 'ENVIRONMENT_MISMATCH',
      erro: 'Borrado bloqueado: os recursos configurados non son os físicos de Producción.'
    };
  }
  return { ok: true, spreadsheetId: spreadsheetId, folderId: folderId };
}

function eliminarFotoAdministracionPortal_(datos) {
  datos = datos || {};
  var permiso = permisoFotosAdministracionV2_(datos.email);
  if (!permiso.ok) return { ok: false, codigo: 'FORBIDDEN', erro: 'Administración non autorizada' };

  var entorno = validarEntornoEliminacionFotosV2_();
  if (!entorno.ok) return entorno;

  var idFoto = String(datos.idFoto || '').trim();
  if (!idFoto) return { ok: false, codigo: 'BAD_REQUEST', erro: 'Falta o identificador da fotografía' };

  var contexto = contextoFotosAdministracionV2_();
  var sheet = contexto.sheet;
  var index = contexto.index;
  var values = sheet.getDataRange().getValues();
  var rowIndex = values.findIndex(function (row, i) {
    return i > 0 && String(row[index.Id_Foto] || '').trim() === idFoto;
  });

  if (rowIndex === -1) {
    return { ok: true, idFoto: idFoto, xaEliminada: true, entorno: 'production', mensaxe: 'A fotografía xa non estaba na Sheet de Producción.' };
  }

  var row = values[rowIndex];
  var rutaDrive = typeof index.Foto === 'number' ? String(row[index.Foto] || '').trim() : '';
  var nomeDrive = rutaDrive ? rutaDrive.split('/').pop() : '';
  var rowNumber = rowIndex + 1;

  sheet.deleteRow(rowNumber);
  SpreadsheetApp.flush();

  var idsAfter = sheet.getLastRow() > 1
    ? sheet.getRange(2, index.Id_Foto + 1, sheet.getLastRow() - 1, 1).getValues()
    : [];
  var segueNaSheet = idsAfter.some(function (fila) { return String(fila[0] || '').trim() === idFoto; });
  if (segueNaSheet) return { ok: false, codigo: 'VERIFY_FAILED', erro: 'A fotografía segue presente na Sheet tras o borrado.' };

  var driveEliminados = 0;
  var avisoDrive = '';
  if (nomeDrive) {
    try {
      var carpeta = DriveApp.getFolderById(entorno.folderId);
      var ficheiros = carpeta.getFilesByName(nomeDrive);
      while (ficheiros.hasNext()) {
        ficheiros.next().setTrashed(true);
        driveEliminados++;
      }
    } catch (erroDrive) {
      avisoDrive = 'A fila eliminouse, pero non se puido enviar o ficheiro de Drive á papeleira.';
      console.error(avisoDrive + ' ' + erroDrive);
    }
  }

  return {
    ok: true,
    idFoto: idFoto,
    xaEliminada: false,
    entorno: 'production',
    driveEliminados: driveEliminados,
    avisoDrive: avisoDrive,
    permisoFonte: permiso.fonte,
    mensaxe: avisoDrive || 'Fotografía eliminada da Sheet e do Drive de Producción.'
  };
}
