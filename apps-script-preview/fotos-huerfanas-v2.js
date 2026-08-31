/*
 * Limpieza segura de rexistros huérfanos de Fotografías en Preview.
 *
 * Só elimina a fila da Sheet cando:
 * - a autorización central de Administración é válida;
 * - os recursos físicos configurados son exactamente os de Preview;
 * - a fila non declara ningunha ruta R2 coñecida;
 * - o ficheiro indicado na columna Foto non existe na carpeta Drive de Preview.
 *
 * Non elimina ficheiros de Drive nin obxectos R2. O Worker retira o rexistro dos
 * índices R2 e fai rollback se esta función non confirma a operación.
 */

function rutasDeclaradasFotoHuerfanaV2_(row, index) {
  var nomes = [
    'RutaR2_Publica',
    'RutaR2_Privada',
    'RutaR2',
    'RutaR2Traballo',
    'RutaMiniaturaPublica',
    'RutaMiniaturaPrivada',
    'RutaMiniatura',
    'RutaMiniaturaRevision'
  ];
  var rutas = [];
  nomes.forEach(function (nome) {
    if (typeof index[nome] !== 'number') return;
    var valor = String(row[index[nome]] || '').trim();
    if (valor) rutas.push(valor);
  });
  return rutas;
}

function eliminarFotoHuerfanaAdministracionPortal_(datos) {
  datos = datos || {};
  var permiso = permisoFotosAdministracionV2_(datos.email);
  if (!permiso.ok) {
    return { ok: false, codigo: 'FORBIDDEN', erro: 'Administración non autorizada' };
  }

  var entorno = validarEntornoEliminacionFotosV2_();
  if (!entorno.ok) return entorno;

  var idFoto = String(datos.idFoto || '').trim();
  if (!idFoto) {
    return { ok: false, codigo: 'BAD_REQUEST', erro: 'Falta o identificador da fotografía' };
  }

  var contexto = contextoFotosAdministracionV2_();
  var sheet = contexto.sheet;
  var index = contexto.index;
  var values = sheet.getDataRange().getValues();
  var rowIndex = values.findIndex(function (row, i) {
    return i > 0 && String(row[index.Id_Foto] || '').trim() === idFoto;
  });

  if (rowIndex === -1) {
    return {
      ok: true,
      idFoto: idFoto,
      huerfana: true,
      xaEliminada: true,
      entorno: 'preview',
      mensaxe: 'O rexistro huérfano xa non estaba na Sheet de Preview.'
    };
  }

  var row = values[rowIndex];
  var rutas = rutasDeclaradasFotoHuerfanaV2_(row, index);
  if (rutas.length) {
    return {
      ok: false,
      codigo: 'ORPHAN_HAS_R2_ROUTE',
      erro: 'Limpieza bloqueada: a fila aínda declara rutas R2.'
    };
  }

  var rutaDrive = typeof index.Foto === 'number'
    ? String(row[index.Foto] || '').trim()
    : '';
  var nomeDrive = rutaDrive ? rutaDrive.split('/').pop() : '';
  if (nomeDrive) {
    try {
      var carpeta = DriveApp.getFolderById(entorno.folderId);
      var ficheiros = carpeta.getFilesByName(nomeDrive);
      if (ficheiros.hasNext()) {
        return {
          ok: false,
          codigo: 'ORPHAN_HAS_DRIVE_FILE',
          erro: 'Limpieza bloqueada: o ficheiro segue existindo na carpeta Drive de Preview.'
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

  var rowNumber = rowIndex + 1;
  sheet.deleteRow(rowNumber);
  SpreadsheetApp.flush();

  var idsAfter = sheet.getLastRow() > 1
    ? sheet.getRange(2, index.Id_Foto + 1, sheet.getLastRow() - 1, 1).getValues()
    : [];
  var segueNaSheet = idsAfter.some(function (fila) {
    return String(fila[0] || '').trim() === idFoto;
  });
  if (segueNaSheet) {
    return {
      ok: false,
      codigo: 'VERIFY_FAILED',
      erro: 'O rexistro huérfano segue presente na Sheet tras a limpeza.'
    };
  }

  return {
    ok: true,
    idFoto: idFoto,
    huerfana: true,
    xaEliminada: false,
    entorno: 'preview',
    permisoFonte: permiso.fonte,
    mensaxe: 'Rexistro fotográfico huérfano eliminado e verificado en Preview.'
  };
}
