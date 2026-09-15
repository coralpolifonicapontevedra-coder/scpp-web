/**
 * Publicación transaccional de fotografías en Cloudflare R2.
 *
 * Flujo:
 * 1. La fotografía permanece como Pendente.
 * 2. Cloudflare obtiene el archivo desde Drive.
 * 3. Cloudflare lo copia a R2 público, privado o ambos.
 * 4. Se guardan las rutas R2.
 * 5. Solo entonces se cambia EstadoRevision a Aprobada.
 *
 * Estas funciones no borran ni modifican el archivo original de Drive.
 *
 * En doPost(e), después de validar WEB_WRITE_TOKEN, deben existir:
 *
 * if (accion === 'obterFotoParaR2') {
 *   return respostaJSON(obterFotoParaR2Portal_(datos));
 * }
 *
 * if (accion === 'listarFotosPendentesR2') {
 *   return respostaJSON(listarFotosPendentesR2Portal_(datos));
 * }
 *
 * if (accion === 'gardarRutasFotoR2') {
 *   return respostaJSON(gardarRutasFotoR2Portal_(datos));
 * }
 */


/**
 * Devuelve a Cloudflare el archivo de Drive para copiarlo a R2.
 *
 * La fotografía puede estar todavía Pendente. No se aprueba aquí.
 */
function obterFotoParaR2Portal_(datos) {
  var correo = String(datos.email || '')
    .trim()
    .toLowerCase();

  if (!obterAdministradorFotosPortalV2_(correo)) {
    return {
      ok: false,
      erro: 'Usuario non autorizado'
    };
  }

  var idFoto = String(
    datos.idFoto ||
    datos.rowId ||
    ''
  ).trim();

  if (!idFoto) {
    return {
      ok: false,
      erro: 'Falta o identificador da fotografía'
    };
  }

  var contexto = obterContextoFotos_();
  var folla = contexto.folla;
  var valores = folla.getDataRange().getValues();

  if (valores.length < 2) {
    return {
      ok: false,
      erro: 'Non hai fotografías rexistradas'
    };
  }

  var cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });

  var indice = indiceR2Fotos_(cabeceiras);

  var indiceFila = valores.findIndex(function(fila, numero) {
    if (numero === 0) return false;

    return String(
      fila[indice.Id_Foto] || ''
    ).trim() === idFoto;
  });

  if (indiceFila === -1) {
    return {
      ok: false,
      erro: 'Non se atopou a fotografía'
    };
  }

  var fila = valores[indiceFila];

  var estado = String(
    fila[indice.EstadoRevision] || ''
  ).trim().toLowerCase();

  /*
   * Permítese Pendente porque a aprobación só se realizará
   * despois de gardar correctamente as rutas R2.
   */
  if (['pendente', 'aprobada'].indexOf(estado) === -1) {
    return {
      ok: false,
      erro: 'A fotografía non está dispoñible para publicar'
    };
  }

  /*
   * Primeiro se utilizan los destinos enviados por la web.
   * Como respaldo, se leen los valores ya guardados en la Sheet.
   */
  var publicarPublica =
    datos.publicarPublica === true ||
    valorBooleanoR2Fotos_(
      fila[indice.Publicar_Publica]
    );

  var publicarPrivada =
    datos.publicarPrivada === true ||
    valorBooleanoR2Fotos_(
      fila[indice.Publicar_Privada]
    );

  if (!publicarPublica && !publicarPrivada) {
    return {
      ok: false,
      erro: 'A fotografía non está destinada a ningunha galería'
    };
  }

  var ficheiro = localizarFicheiroFotoR2_(
    contexto,
    fila[indice.Foto]
  );

  if (!ficheiro) {
    return {
      ok: false,
      erro: 'Non se atopou o ficheiro da fotografía en Drive'
    };
  }

  var blob = ficheiro.getBlob();
  var bytes = blob.getBytes();

  if (bytes.length > 8 * 1024 * 1024) {
    return {
      ok: false,
      erro: 'A fotografía supera o máximo de 8 MB'
    };
  }

  var mimeType = String(
    blob.getContentType() ||
    ficheiro.getMimeType() ||
    'image/jpeg'
  ).trim().toLowerCase();

  if (
    ['image/jpeg', 'image/png', 'image/webp']
      .indexOf(mimeType) === -1
  ) {
    return {
      ok: false,
      erro: 'O formato da fotografía non é compatible con R2'
    };
  }

  return {
    ok: true,
    idFoto: idFoto,
    rowId: idFoto,
    nomeFicheiro: ficheiro.getName(),
    mimeType: mimeType,
    publicarPublica: publicarPublica,
    publicarPrivada: publicarPrivada,
    base64: Utilities.base64Encode(bytes)
  };
}


/**
 * Lista fotografías destinadas a alguna galería que todavía
 * no tienen todas sus rutas R2.
 */
function listarFotosPendentesR2Portal_(datos) {
  var correo = String(datos.email || '')
    .trim()
    .toLowerCase();

  if (!obterAdministradorFotosPortalV2_(correo)) {
    return {
      ok: false,
      erro: 'Usuario non autorizado'
    };
  }

  var contexto = obterContextoFotos_();
  var folla = contexto.folla;
  var valores = folla.getDataRange().getDisplayValues();

  if (valores.length < 2) {
    return {
      ok: true,
      fotos: []
    };
  }

  var cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });

  var indice = indiceR2Fotos_(cabeceiras);

  var fotos = valores
    .slice(1)
    .filter(function(fila) {
      var estado = String(
        fila[indice.EstadoRevision] || ''
      ).trim().toLowerCase();

      var publicable =
        estado === 'pendente' ||
        estado === 'aprobada';

      var publica = valorBooleanoR2Fotos_(
        fila[indice.Publicar_Publica]
      );

      var privada = valorBooleanoR2Fotos_(
        fila[indice.Publicar_Privada]
      );

      var faltaPublica =
        publica &&
        !String(
          fila[indice.RutaR2_Publica] || ''
        ).trim();

      var faltaPrivada =
        privada &&
        !String(
          fila[indice.RutaR2_Privada] || ''
        ).trim();

      return publicable &&
        (faltaPublica || faltaPrivada);
    })
    .map(function(fila) {
      return {
        idFoto: String(
          fila[indice.Id_Foto] || ''
        ).trim(),

        titulo: String(
          fila[indice.Titulo] || ''
        ).trim() || 'Fotografía sen título',

        publicarPublica: valorBooleanoR2Fotos_(
          fila[indice.Publicar_Publica]
        ),

        publicarPrivada: valorBooleanoR2Fotos_(
          fila[indice.Publicar_Privada]
        )
      };
    })
    .filter(function(foto) {
      return !!foto.idFoto;
    });

  return {
    ok: true,
    fotos: fotos
  };
}


/**
 * Guarda las rutas confirmadas por Cloudflare.
 *
 * Este es el único punto que cambia la fotografía a Aprobada.
 */
function gardarRutasFotoR2Portal_(datos) {
  var correo = String(datos.email || '')
    .trim()
    .toLowerCase();

  if (!obterAdministradorFotosPortalV2_(correo)) {
    return {
      ok: false,
      erro: 'Usuario non autorizado'
    };
  }

  var idFoto = String(
    datos.idFoto ||
    datos.rowId ||
    ''
  ).trim();

  var rutaPublica = String(
    datos.rutaPublica || ''
  ).trim();

  var rutaPrivada = String(
    datos.rutaPrivada || ''
  ).trim();

  if (!idFoto) {
    return {
      ok: false,
      erro: 'Falta o identificador da fotografía'
    };
  }

  if (!rutaPublica && !rutaPrivada) {
    return {
      ok: false,
      erro: 'Non se recibiu ningunha ruta R2'
    };
  }

  var contexto = obterContextoFotos_();
  var folla = contexto.folla;
  var valores = folla.getDataRange().getValues();

  if (valores.length < 2) {
    return {
      ok: false,
      erro: 'Non hai fotografías rexistradas'
    };
  }

  var cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });

  var indice = indiceR2Fotos_(cabeceiras);

  var indiceFila = valores.findIndex(function(fila, numero) {
    if (numero === 0) return false;

    return String(
      fila[indice.Id_Foto] || ''
    ).trim() === idFoto;
  });

  if (indiceFila === -1) {
    return {
      ok: false,
      erro: 'Non se atopou a fotografía'
    };
  }

  var numeroFila = indiceFila + 1;
  var filaActual = valores[indiceFila];

  var publicaSolicitada = valorBooleanoR2Fotos_(
    filaActual[indice.Publicar_Publica]
  );

  var privadaSolicitada = valorBooleanoR2Fotos_(
    filaActual[indice.Publicar_Privada]
  );

  /*
   * Comprobamos que se recibieron todas las rutas obligatorias.
   * No se aprobará una publicación incompleta.
   */
  if (publicaSolicitada && !rutaPublica) {
    return {
      ok: false,
      erro: 'Falta confirmar a ruta R2 da galería pública'
    };
  }

  if (privadaSolicitada && !rutaPrivada) {
    return {
      ok: false,
      erro: 'Falta confirmar a ruta R2 da galería privada'
    };
  }

  /*
   * Primero se guardan las rutas.
   */
  if (rutaPublica) {
    folla
      .getRange(
        numeroFila,
        indice.RutaR2_Publica + 1
      )
      .setValue(rutaPublica);
  }

  if (rutaPrivada) {
    folla
      .getRange(
        numeroFila,
        indice.RutaR2_Privada + 1
      )
      .setValue(rutaPrivada);
  }

  /*
   * Solo después de haber recibido todas las rutas
   * se aprueba definitivamente la fotografía.
   */
  var agora = new Date();

  folla
    .getRange(
      numeroFila,
      indice.EstadoRevision + 1
    )
    .setValue('Aprobada');

  if (indice.Data_Revision !== -1) {
    folla
      .getRange(
        numeroFila,
        indice.Data_Revision + 1
      )
      .setValue(agora);
  }

  if (indice.Revisada_Por !== -1) {
    folla
      .getRange(
        numeroFila,
        indice.Revisada_Por + 1
      )
      .setValue(correo);
  }

  if (
    rutaPublica &&
    indice.Data_Publicacion_Publica !== -1
  ) {
    folla
      .getRange(
        numeroFila,
        indice.Data_Publicacion_Publica + 1
      )
      .setValue(agora);
  }

  if (
    rutaPrivada &&
    indice.Data_Publicacion_Privada !== -1
  ) {
    folla
      .getRange(
        numeroFila,
        indice.Data_Publicacion_Privada + 1
      )
      .setValue(agora);
  }

  SpreadsheetApp.flush();

  return {
    ok: true,
    idFoto: idFoto,
    rowId: idFoto,
    estado: 'Aprobada',
    rutaPublica: rutaPublica,
    rutaPrivada: rutaPrivada,
    mensaxe:
      'Fotografía copiada a R2 e publicada correctamente'
  };
}


/**
 * Obtiene los índices de las columnas necesarias.
 */
function indiceR2Fotos_(cabeceiras) {
  var necesarias = [
    'Id_Foto',
    'Foto',
    'Titulo',
    'EstadoRevision',
    'Publicar_Publica',
    'Publicar_Privada',
    'RutaR2_Publica',
    'RutaR2_Privada'
  ];

  var indice = {};

  necesarias.forEach(function(nome) {
    indice[nome] = cabeceiras.indexOf(nome);

    if (indice[nome] === -1) {
      throw new Error(
        'Falta a columna ' +
        nome +
        ' na folla Fotos'
      );
    }
  });

  /*
   * Estas columnas son opcionales para permitir compatibilidad
   * con versiones anteriores de la Sheet.
   */
  [
    'Data_Revision',
    'Revisada_Por',
    'Data_Publicacion_Publica',
    'Data_Publicacion_Privada'
  ].forEach(function(nomeOpcional) {
    indice[nomeOpcional] =
      cabeceiras.indexOf(nomeOpcional);
  });

  return indice;
}


/**
 * Localiza el archivo original dentro de Fotos_Images.
 */
function localizarFicheiroFotoR2_(contexto, rutaFoto) {
  var ruta = String(rutaFoto || '').trim();

  if (!ruta) return null;

  var nomeFicheiro = ruta
    .replace(/\\/g, '/')
    .split('/')
    .pop();

  if (!nomeFicheiro) return null;

  var folderId = String(
    contexto.folderId || ''
  ).trim();

  if (!folderId) {
    folderId = String(
      PropertiesService
        .getScriptProperties()
        .getProperty('FOTOS_FOLDER_ID') || ''
    ).trim();
  }

  if (!folderId) {
    throw new Error(
      'Falta configurar FOTOS_FOLDER_ID'
    );
  }

  var carpeta = DriveApp.getFolderById(folderId);
  var ficheiros = carpeta.getFilesByName(nomeFicheiro);

  return ficheiros.hasNext()
    ? ficheiros.next()
    : null;
}


/**
 * Convierte valores de Sheet a booleano.
 */
function valorBooleanoR2Fotos_(valor) {
  if (valor === true) return true;
  if (valor === false) return false;

  return [
    'true',
    'verdadero',
    'verdadeiro',
    'si',
    'sí',
    'yes',
    '1'
  ].indexOf(
    String(valor || '')
      .trim()
      .toLowerCase()
  ) !== -1;
}