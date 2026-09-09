/*
 * Eliminación segura desde el Portal SCPP.
 *
 * Incluye:
 * - eliminarEnsaioPortal_
 * - eliminarFotoPortal_
 *
 * Las funciones reutilizan los helpers existentes de los módulos
 * Ensaios y Fotos.
 */


/* ============================================================
 * ELIMINAR ENSAIO
 * ============================================================ */

function eliminarEnsaioPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);

  if (!permiso.escritura) {
    return {
      ok: false,
      codigo: 'FORBIDDEN',
      erro: 'Usuario non autorizado para eliminar ensaios'
    };
  }

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);

  if (!idEnsaio) {
    return {
      ok: false,
      codigo: 'VALIDATION',
      erro: 'Falta identificar o ensaio'
    };
  }

  var cfg = configuracionEnsaiosPortal_();
  var ensaios = filasEnsaiosPortal_(cfg.ensaiosId, 'Ensaios');

  var filaEnsaio = ensaios.rows.find(function (row) {
    return textoEnsaiosPortal_(
      campoEnsaiosPortal_(row, ['Id_Ensaio', 'IdEnsaio', 'Id'])
    ) === idEnsaio;
  });

  if (!filaEnsaio) {
    return {
      ok: false,
      codigo: 'NOT_FOUND',
      erro: 'Non se atopou o ensaio'
    };
  }

  function eliminarRelacionadas_(spreadsheetId, nomeFolla, nomesCampo) {
    var datosFolla = filasEnsaiosPortal_(spreadsheetId, nomeFolla);

    var filas = datosFolla.rows
      .filter(function (row) {
        return textoEnsaiosPortal_(
          campoEnsaiosPortal_(row, nomesCampo)
        ) === idEnsaio;
      })
      .map(function (row) {
        return row.__row;
      })
      .sort(function (a, b) {
        return b - a;
      });

    filas.forEach(function (numeroFila) {
      datosFolla.sheet.deleteRow(numeroFila);
    });

    return filas.length;
  }

  var asistenciasEliminadas = eliminarRelacionadas_(
    cfg.asistenciasId,
    'AsistenciasEnsaios',
    ['Ensaio', 'Id_Ensaio', 'IdEnsaio']
  );

  var obrasEliminadas = eliminarRelacionadas_(
    cfg.ensaiosRepertorioId,
    'EnsaiosRepertorio',
    ['Ensaio', 'Id_Ensaio', 'IdEnsaio']
  );

  ensaios.sheet.deleteRow(filaEnsaio.__row);

  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      asistenciasEliminadas: asistenciasEliminadas,
      obrasEliminadas: obrasEliminadas,
      eliminadoPor: email
    }
  };
}


/* ============================================================
 * ELIMINAR FOTOGRAFÍA
 * ============================================================ */

function eliminarFotoPortal_(datos) {
  var email = String(datos && datos.email || '')
    .trim()
    .toLowerCase();

  /*
   * Mantemos exactamente o mesmo sistema de permisos que utiliza
   * o módulo Revisar fotografías:
   * administrador ou usuario con RevisarFotos.
   */
  var usuario = obterAdministradorFotos_(email);

  if (!usuario) {
    return {
      ok: false,
      codigo: 'FORBIDDEN',
      erro: 'Usuario non autorizado para eliminar fotografías'
    };
  }

  var rowId = String(
    datos && (datos.rowId || datos.idFoto) || ''
  ).trim();

  if (!rowId) {
    return {
      ok: false,
      codigo: 'VALIDATION',
      erro: 'Falta identificar a fotografía'
    };
  }

  var contexto;

  try {
    contexto = obterContextoFotos_();
  } catch (erro) {
    return {
      ok: false,
      codigo: 'CONFIG',
      erro: erro && erro.message
        ? erro.message
        : 'Non se puido acceder ao arquivo fotográfico'
    };
  }

  var valores = contexto.folla.getDataRange().getValues();

  if (!valores || valores.length < 2) {
    return {
      ok: false,
      codigo: 'NOT_FOUND',
      erro: 'Non se atopou a fotografía'
    };
  }

  var cabeceiras = valores[0].map(function (valor) {
    return String(valor || '').trim();
  });

  var indice;

  try {
    indice = indiceCabeceirasFotos_(cabeceiras);
  } catch (erro) {
    return {
      ok: false,
      codigo: 'SCHEMA',
      erro: erro && erro.message
        ? erro.message
        : 'A estrutura da folla Fotos non é válida'
    };
  }

  var filaIndice = valores.findIndex(function (fila, i) {
    return (
      i > 0 &&
      String(fila[indice['Row ID']] || '').trim() === rowId
    );
  });

  if (filaIndice === -1) {
    return {
      ok: false,
      codigo: 'NOT_FOUND',
      erro: 'Non se atopou a fotografía'
    };
  }

  var numeroFila = filaIndice + 1;
  var fila = valores[filaIndice];

  /*
   * Na Sheet a columna Foto contén normalmente unha ruta como:
   *
   * Fotos_Images/20260813-123456-foto.jpg
   *
   * Extraemos só o nome para localizar o ficheiro dentro da
   * carpeta configurada para Fotos.
   */
  var rutaFoto = String(
    fila[indice.Foto] || ''
  ).trim();

  var nomeFicheiro = rutaFoto
    ? rutaFoto.split('/').pop()
    : '';

  var ficheirosDriveEliminados = 0;

  /*
   * Primeiro enviamos á papeleira de Drive o orixinal.
   *
   * A eliminación física de R2 NON se realiza aquí porque
   * Apps Script non ten acceso directo aos buckets de Cloudflare.
   * Esa limpeza realízase desde o endpoint do Portal.
   */
  if (nomeFicheiro) {
    try {
      var carpeta = DriveApp.getFolderById(contexto.folderId);
      var ficheiros = carpeta.getFilesByName(nomeFicheiro);

      while (ficheiros.hasNext()) {
        var ficheiro = ficheiros.next();

        try {
          ficheiro.setTrashed(true);
          ficheirosDriveEliminados++;
        } catch (erroFicheiro) {
          console.error(
            'Non se puido enviar á papeleira o ficheiro ' +
            nomeFicheiro +
            ': ' +
            erroFicheiro
          );
        }
      }
    } catch (erroDrive) {
      /*
       * Non impedimos eliminar o rexistro se, por exemplo,
       * o ficheiro xa non existe en Drive.
       */
      console.error(
        'Non se puido localizar/eliminar o orixinal en Drive: ' +
        erroDrive
      );
    }
  }

  /*
   * Eliminamos o rexistro da Sheet.
   *
   * Isto fai que deixe de existir no inventario Fotos e,
   * polo tanto, deixe tamén de aparecer como pendente.
   */
  try {
    contexto.folla.deleteRow(numeroFila);
    SpreadsheetApp.flush();
  } catch (erroSheet) {
    return {
      ok: false,
      codigo: 'SHEET_DELETE',
      erro: 'Non se puido eliminar o rexistro da fotografía da Sheet'
    };
  }

  return {
    ok: true,
    resultado: {
      rowId: rowId,
      idFoto: rowId,
      ficheiro: nomeFicheiro,
      ficheirosDriveEliminados: ficheirosDriveEliminados,
      eliminadoPor: email
    },
    mensaxe: ficheirosDriveEliminados > 0
      ? 'Fotografía eliminada do arquivo e enviada á papeleira de Drive'
      : 'Fotografía eliminada do arquivo'
  };
}