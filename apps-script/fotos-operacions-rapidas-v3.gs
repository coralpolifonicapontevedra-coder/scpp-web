/*
 * Operacións de Fotografías v3.
 *
 * Obxectivo: evitar que Fotografías reteña o ScriptLock global durante toda a
 * operación. O bloqueo úsase só arredor da mutación crítica da Sheet e libérase
 * antes de acceder a Drive. Así mantense a protección fronte a escrituras
 * concorrentes sen introducir esperas longas no resto do Apps Script.
 *
 * Este ficheiro é común a Preview e Producción. A garda física segue a cargo de
 * validarEntornoEliminacionFotosV2_(), definida no módulo propio de cada entorno.
 */

var FOTOS_SCRIPT_PREVIEW_V3_ = '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF';
var FOTOS_SCRIPT_PRODUCTION_V3_ = '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV';
var FOTOS_LOCK_TIMEOUT_MS_V3_ = 2500;

function entornoFotosOperacionsV3_() {
  var scriptId = ScriptApp.getScriptId();
  if (scriptId === FOTOS_SCRIPT_PREVIEW_V3_) return 'preview';
  if (scriptId === FOTOS_SCRIPT_PRODUCTION_V3_) return 'production';
  return '';
}

function bloqueoOcupadoFotosV3_() {
  return {
    ok: false,
    codigo: 'PHOTO_LOCK_BUSY',
    erro: 'Fotografías está ocupada por outra escritura. Téntao de novo nuns segundos.'
  };
}

function adquirirBloqueoFotosV3_() {
  var bloqueo = LockService.getScriptLock();
  return bloqueo.tryLock(FOTOS_LOCK_TIMEOUT_MS_V3_) ? bloqueo : null;
}

function localizarFilaFotoV3_(sheet, index, idFoto) {
  var values = sheet.getDataRange().getValues();
  var rowIndex = values.findIndex(function (row, i) {
    return i > 0 && String(row[index.Id_Foto] || '').trim() === idFoto;
  });
  return { values: values, rowIndex: rowIndex };
}

function gardarFotoAdministracionPortalV3_(datos) {
  datos = datos || {};
  var permiso = permisoFotosAdministracionV2_(datos.email);
  if (!permiso.ok) return { ok: false, codigo: 'FORBIDDEN', erro: 'Administración non autorizada' };

  var idFoto = String(datos.idFoto || '').trim();
  if (!idFoto) return { ok: false, codigo: 'BAD_REQUEST', erro: 'Falta o identificador da fotografía' };

  var bloqueo = adquirirBloqueoFotosV3_();
  if (!bloqueo) return bloqueoOcupadoFotosV3_();

  try {
    var contexto = contextoFotosAdministracionV2_();
    var sheet = contexto.sheet;
    var index = contexto.index;
    var localizado = localizarFilaFotoV3_(sheet, index, idFoto);
    var rowIndex = localizado.rowIndex;
    if (rowIndex === -1) return { ok: false, codigo: 'NOT_FOUND', erro: 'Non se atopou a fotografía' };

    var rowNumber = rowIndex + 1;
    var row = localizado.values[rowIndex].slice();
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
      return {
        ok: false,
        codigo: 'VERIFY_FAILED',
        erro: 'A verificación da publicación na Sheet non coincide co solicitado'
      };
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
      entorno: entornoFotosOperacionsV3_(),
      mensaxe: 'Fotografía gardada e verificada coa autorización central de Administración'
    };
  } finally {
    bloqueo.releaseLock();
  }
}

function eliminarFotoAdministracionPortalV3_(datos) {
  datos = datos || {};
  var permiso = permisoFotosAdministracionV2_(datos.email);
  if (!permiso.ok) return { ok: false, codigo: 'FORBIDDEN', erro: 'Administración non autorizada' };

  var entornoFisico = validarEntornoEliminacionFotosV2_();
  if (!entornoFisico.ok) return entornoFisico;
  var entorno = entornoFotosOperacionsV3_();
  if (!entorno) return { ok: false, codigo: 'ENVIRONMENT_UNKNOWN', erro: 'Non se recoñeceu o Apps Script do entorno.' };

  var idFoto = String(datos.idFoto || '').trim();
  if (!idFoto) return { ok: false, codigo: 'BAD_REQUEST', erro: 'Falta o identificador da fotografía' };

  var nomeDrive = '';
  var bloqueo = adquirirBloqueoFotosV3_();
  if (!bloqueo) return bloqueoOcupadoFotosV3_();

  try {
    var contexto = contextoFotosAdministracionV2_();
    var sheet = contexto.sheet;
    var index = contexto.index;
    var localizado = localizarFilaFotoV3_(sheet, index, idFoto);
    var rowIndex = localizado.rowIndex;

    if (rowIndex === -1) {
      return {
        ok: true,
        idFoto: idFoto,
        xaEliminada: true,
        entorno: entorno,
        mensaxe: 'A fotografía xa non estaba na Sheet do entorno.'
      };
    }

    var row = localizado.values[rowIndex];
    var rutaDrive = typeof index.Foto === 'number' ? String(row[index.Foto] || '').trim() : '';
    nomeDrive = rutaDrive ? rutaDrive.split('/').pop() : '';
    sheet.deleteRow(rowIndex + 1);
    SpreadsheetApp.flush();

    var idsAfter = sheet.getLastRow() > 1
      ? sheet.getRange(2, index.Id_Foto + 1, sheet.getLastRow() - 1, 1).getValues()
      : [];
    var segueNaSheet = idsAfter.some(function (fila) {
      return String(fila[0] || '').trim() === idFoto;
    });
    if (segueNaSheet) {
      return { ok: false, codigo: 'VERIFY_FAILED', erro: 'A fotografía segue presente na Sheet tras o borrado.' };
    }
  } finally {
    bloqueo.releaseLock();
  }

  var driveEliminados = 0;
  var avisoDrive = '';
  if (nomeDrive) {
    try {
      var carpeta = DriveApp.getFolderById(entornoFisico.folderId);
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
    entorno: entorno,
    driveEliminados: driveEliminados,
    avisoDrive: avisoDrive,
    permisoFonte: permiso.fonte,
    mensaxe: avisoDrive || 'Fotografía eliminada da Sheet e do Drive do entorno.'
  };
}

function eliminarFotoHuerfanaAdministracionPortalV3_(datos) {
  datos = datos || {};
  var permiso = permisoFotosAdministracionV2_(datos.email);
  if (!permiso.ok) return { ok: false, codigo: 'FORBIDDEN', erro: 'Administración non autorizada' };

  var entornoFisico = validarEntornoEliminacionFotosV2_();
  if (!entornoFisico.ok) return entornoFisico;
  var entorno = entornoFotosOperacionsV3_();
  if (!entorno) return { ok: false, codigo: 'ENVIRONMENT_UNKNOWN', erro: 'Non se recoñeceu o Apps Script do entorno.' };

  var idFoto = String(datos.idFoto || '').trim();
  if (!idFoto) return { ok: false, codigo: 'BAD_REQUEST', erro: 'Falta o identificador da fotografía' };

  var nomeDrive = '';
  var bloqueoLectura = adquirirBloqueoFotosV3_();
  if (!bloqueoLectura) return bloqueoOcupadoFotosV3_();
  try {
    var contextoLectura = contextoFotosAdministracionV2_();
    var localizadoLectura = localizarFilaFotoV3_(contextoLectura.sheet, contextoLectura.index, idFoto);
    if (localizadoLectura.rowIndex === -1) {
      return {
        ok: true,
        idFoto: idFoto,
        huerfana: true,
        xaEliminada: true,
        entorno: entorno,
        mensaxe: 'O rexistro huérfano xa non estaba na Sheet.'
      };
    }
    var rowLectura = localizadoLectura.values[localizadoLectura.rowIndex];
    var rutasLectura = rutasDeclaradasFotoHuerfanaV2_(rowLectura, contextoLectura.index);
    if (rutasLectura.length) {
      return { ok: false, codigo: 'ORPHAN_HAS_R2_ROUTE', erro: 'Limpieza bloqueada: a fila aínda declara rutas R2.' };
    }
    var rutaDrive = typeof contextoLectura.index.Foto === 'number'
      ? String(rowLectura[contextoLectura.index.Foto] || '').trim()
      : '';
    nomeDrive = rutaDrive ? rutaDrive.split('/').pop() : '';
  } finally {
    bloqueoLectura.releaseLock();
  }

  if (nomeDrive) {
    try {
      var carpeta = DriveApp.getFolderById(entornoFisico.folderId);
      var ficheiros = carpeta.getFilesByName(nomeDrive);
      if (ficheiros.hasNext()) {
        return {
          ok: false,
          codigo: 'ORPHAN_HAS_DRIVE_FILE',
          erro: 'Limpieza bloqueada: o ficheiro segue existindo na carpeta Drive.'
        };
      }
    } catch (erroDrive) {
      return {
        ok: false,
        codigo: 'ORPHAN_DRIVE_CHECK_FAILED',
        erro: 'Non se puido verificar con seguridade a ausencia do ficheiro en Drive.'
      };
    }
  }

  var bloqueoBorrado = adquirirBloqueoFotosV3_();
  if (!bloqueoBorrado) return bloqueoOcupadoFotosV3_();
  try {
    var contexto = contextoFotosAdministracionV2_();
    var sheet = contexto.sheet;
    var index = contexto.index;
    var localizado = localizarFilaFotoV3_(sheet, index, idFoto);
    if (localizado.rowIndex === -1) {
      return {
        ok: true,
        idFoto: idFoto,
        huerfana: true,
        xaEliminada: true,
        entorno: entorno,
        mensaxe: 'O rexistro huérfano xa non estaba na Sheet.'
      };
    }

    var row = localizado.values[localizado.rowIndex];
    var rutas = rutasDeclaradasFotoHuerfanaV2_(row, index);
    if (rutas.length) {
      return { ok: false, codigo: 'ORPHAN_HAS_R2_ROUTE', erro: 'Limpieza bloqueada: a fila aínda declara rutas R2.' };
    }

    sheet.deleteRow(localizado.rowIndex + 1);
    SpreadsheetApp.flush();
    var idsAfter = sheet.getLastRow() > 1
      ? sheet.getRange(2, index.Id_Foto + 1, sheet.getLastRow() - 1, 1).getValues()
      : [];
    var segueNaSheet = idsAfter.some(function (fila) {
      return String(fila[0] || '').trim() === idFoto;
    });
    if (segueNaSheet) {
      return { ok: false, codigo: 'VERIFY_FAILED', erro: 'O rexistro huérfano segue presente na Sheet tras a limpeza.' };
    }
  } finally {
    bloqueoBorrado.releaseLock();
  }

  return {
    ok: true,
    idFoto: idFoto,
    huerfana: true,
    xaEliminada: false,
    entorno: entorno,
    permisoFonte: permiso.fonte,
    mensaxe: 'Rexistro fotográfico huérfano eliminado e verificado.'
  };
}
