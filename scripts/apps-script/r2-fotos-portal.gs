/**
 * Ponte temporal para copiar fotografías desde Google Drive a Cloudflare R2.
 *
 * Engadir este ficheiro ao mesmo proxecto de Apps Script que atende o portal.
 * No doPost(e), despois de validar WEB_WRITE_TOKEN, engadir:
 *
 * if (datos.accion === 'obterFotoParaR2') {
 *   return respostaJSON(obterFotoParaR2Portal_(datos));
 * }
 *
 * Esta función non elimina nin modifica o ficheiro de Drive.
 */
function obterFotoParaR2Portal_(datos) {
  var correo = String(datos.email || '').trim().toLowerCase();

  if (!obterAdministradorFotos_(correo)) {
    return {
      ok: false,
      erro: 'Usuario non autorizado'
    };
  }

  var idFoto = String(
    datos.idFoto || datos.rowId || ''
  ).trim();

  if (!idFoto) {
    return {
      ok: false,
      erro: 'Falta o identificador da fotografía'
    };
  }

  var folla = obterFollaFotosPortal_();
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

  var indiceId = cabeceiras.indexOf('Id_Foto');
  var indiceFoto = cabeceiras.indexOf('Foto');
  var indiceEstado = cabeceiras.indexOf('EstadoRevision');
  var indicePublica = cabeceiras.indexOf('Publicar_Publica');
  var indicePrivada = cabeceiras.indexOf('Publicar_Privada');

  if (
    indiceId === -1 ||
    indiceFoto === -1 ||
    indiceEstado === -1 ||
    indicePublica === -1 ||
    indicePrivada === -1
  ) {
    return {
      ok: false,
      erro: 'Faltan columnas necesarias na folla Fotos'
    };
  }

  var indiceFila = valores.findIndex(function(fila, numero) {
    return numero > 0 &&
      String(fila[indiceId] || '').trim() === idFoto;
  });

  if (indiceFila === -1) {
    return {
      ok: false,
      erro: 'Non se atopou a fotografía'
    };
  }

  var fila = valores[indiceFila];
  var estado = String(fila[indiceEstado] || '')
    .trim()
    .toLowerCase();

  if (estado !== 'aprobada') {
    return {
      ok: false,
      erro: 'Só se poden migrar fotografías aprobadas'
    };
  }

  var publicarPublica = valorBooleanoPortal_(
    fila[indicePublica]
  );

  var publicarPrivada = valorBooleanoPortal_(
    fila[indicePrivada]
  );

  if (!publicarPublica && !publicarPrivada) {
    return {
      ok: false,
      erro: 'A fotografía non está publicada en ningunha galería'
    };
  }

  var ficheiro = localizarFicheiroFoto_(
    fila[indiceFoto]
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
    nomeFicheiro: ficheiro.getName(),
    mimeType: mimeType,
    publicarPublica: publicarPublica,
    publicarPrivada: publicarPrivada,
    base64: Utilities.base64Encode(bytes)
  };
}
