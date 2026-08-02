/**
 * Migración controlada de fotografías desde Google Drive a Cloudflare R2.
 *
 * Engadir no doPost(e), despois de validar WEB_WRITE_TOKEN:
 *
 * if (accion === 'obterFotoParaR2') {
 *   return respostaJSON(obterFotoParaR2Portal_(datos));
 * }
 * if (accion === 'listarFotosPendentesR2') {
 *   return respostaJSON(listarFotosPendentesR2Portal_(datos));
 * }
 * if (accion === 'gardarRutasFotoR2') {
 *   return respostaJSON(gardarRutasFotoR2Portal_(datos));
 * }
 *
 * Estas funcións non eliminan nin modifican os ficheiros orixinais de Drive.
 * A publicación é transaccional: unha foto pode prepararse estando Pendente e
 * só pasa a Aprobada cando as rutas R2 quedan gardadas correctamente.
 */

function obterFotoParaR2Portal_(datos) {
  var correo = String(datos.email || '').trim().toLowerCase();
  if (!obterAdministradorFotos_(correo)) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  var idFoto = String(datos.idFoto || datos.rowId || '').trim();
  if (!idFoto) {
    return { ok: false, erro: 'Falta o identificador da fotografía' };
  }

  var folla = obterFollaFotosPortal_();
  var valores = folla.getDataRange().getValues();
  if (valores.length < 2) {
    return { ok: false, erro: 'Non hai fotografías rexistradas' };
  }

  var cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });
  var indice = indiceR2Fotos_(cabeceiras);

  var indiceFila = valores.findIndex(function(fila, numero) {
    return numero > 0 && String(fila[indice.Id_Foto] || '').trim() === idFoto;
  });
  if (indiceFila === -1) {
    return { ok: false, erro: 'Non se atopou a fotografía' };
  }

  var fila = valores[indiceFila];
  var estado = String(fila[indice.EstadoRevision] || '').trim().toLowerCase();
  if (['pendente', 'aprobada'].indexOf(estado) === -1) {
    return { ok: false, erro: 'A fotografía non está dispoñible para publicar' };
  }

  var publicarPublica = datos.publicarPublica === true ||
    valorBooleanoPortal_(fila[indice.Publicar_Publica]);
  var publicarPrivada = datos.publicarPrivada === true ||
    valorBooleanoPortal_(fila[indice.Publicar_Privada]);
  if (!publicarPublica && !publicarPrivada) {
    return { ok: false, erro: 'A fotografía non está destinada a ningunha galería' };
  }

  var ficheiro = localizarFicheiroFoto_(fila[indice.Foto]);
  if (!ficheiro) {
    return { ok: false, erro: 'Non se atopou o ficheiro da fotografía en Drive' };
  }

  var blob = ficheiro.getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > 8 * 1024 * 1024) {
    return { ok: false, erro: 'A fotografía supera o máximo de 8 MB' };
  }

  var mimeType = String(
    blob.getContentType() || ficheiro.getMimeType() || 'image/jpeg'
  ).trim().toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) === -1) {
    return { ok: false, erro: 'O formato da fotografía non é compatible con R2' };
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

function listarFotosPendentesR2Portal_(datos) {
  var correo = String(datos.email || '').trim().toLowerCase();
  if (!obterAdministradorFotos_(correo)) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  var folla = obterFollaFotosPortal_();
  var valores = folla.getDataRange().getDisplayValues();
  if (valores.length < 2) return { ok: true, fotos: [] };

  var cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });
  var indice = indiceR2Fotos_(cabeceiras);

  var fotos = valores.slice(1).filter(function(fila) {
    var estado = String(fila[indice.EstadoRevision] || '').trim().toLowerCase();
    var publicable = estado === 'aprobada' || estado === 'pendente';
    var publica = valorBooleanoPortal_(fila[indice.Publicar_Publica]);
    var privada = valorBooleanoPortal_(fila[indice.Publicar_Privada]);
    var faltaPublica = publica && !String(fila[indice.RutaR2_Publica] || '').trim();
    var faltaPrivada = privada && !String(fila[indice.RutaR2_Privada] || '').trim();
    return publicable && (faltaPublica || faltaPrivada);
  }).map(function(fila) {
    return {
      idFoto: String(fila[indice.Id_Foto] || '').trim(),
      titulo: String(fila[indice.Titulo] || '').trim() || 'Fotografía sen título',
      publicarPublica: valorBooleanoPortal_(fila[indice.Publicar_Publica]),
      publicarPrivada: valorBooleanoPortal_(fila[indice.Publicar_Privada])
    };
  }).filter(function(foto) {
    return !!foto.idFoto;
  });

  return { ok: true, fotos: fotos };
}

function gardarRutasFotoR2Portal_(datos) {
  var correo = String(datos.email || '').trim().toLowerCase();
  if (!obterAdministradorFotos_(correo)) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  var idFoto = String(datos.idFoto || '').trim();
  var rutaPublica = String(datos.rutaPublica || '').trim();
  var rutaPrivada = String(datos.rutaPrivada || '').trim();
  if (!idFoto || (!rutaPublica && !rutaPrivada)) {
    return { ok: false, erro: 'Faltan o identificador ou as rutas R2' };
  }

  var folla = obterFollaFotosPortal_();
  var valores = folla.getDataRange().getValues();
  var cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });
  var indice = indiceR2Fotos_(cabeceiras);

  var indiceFila = valores.findIndex(function(fila, numero) {
    return numero > 0 && String(fila[indice.Id_Foto] || '').trim() === idFoto;
  });
  if (indiceFila === -1) {
    return { ok: false, erro: 'Non se atopou a fotografía' };
  }

  var numeroFila = indiceFila + 1;
  if (rutaPublica) {
    folla.getRange(numeroFila, indice.RutaR2_Publica + 1).setValue(rutaPublica);
  }
  if (rutaPrivada) {
    folla.getRange(numeroFila, indice.RutaR2_Privada + 1).setValue(rutaPrivada);
  }

  // Só agora, cando R2 confirmou e as rutas están dispoñibles, publícase.
  folla.getRange(numeroFila, indice.EstadoRevision + 1).setValue('Aprobada');
  if (indice.Data_Revision !== -1) {
    folla.getRange(numeroFila, indice.Data_Revision + 1).setValue(new Date());
  }
  if (indice.Revisada_Por !== -1) {
    folla.getRange(numeroFila, indice.Revisada_Por + 1).setValue(correo);
  }
  if (rutaPublica && indice.Data_Publicacion_Publica !== -1) {
    folla.getRange(numeroFila, indice.Data_Publicacion_Publica + 1).setValue(new Date());
  }
  if (rutaPrivada && indice.Data_Publicacion_Privada !== -1) {
    folla.getRange(numeroFila, indice.Data_Publicacion_Privada + 1).setValue(new Date());
  }
  SpreadsheetApp.flush();

  return {
    ok: true,
    idFoto: idFoto,
    estado: 'Aprobada',
    rutaPublica: rutaPublica,
    rutaPrivada: rutaPrivada
  };
}

function indiceR2Fotos_(cabeceiras) {
  var necesarias = [
    'Id_Foto', 'Foto', 'Titulo', 'EstadoRevision',
    'Publicar_Publica', 'Publicar_Privada',
    'RutaR2_Publica', 'RutaR2_Privada'
  ];
  var indice = {};
  necesarias.forEach(function(nome) {
    indice[nome] = cabeceiras.indexOf(nome);
    if (indice[nome] === -1) {
      throw new Error('Falta a columna ' + nome + ' na folla Fotos');
    }
  });

  ['Data_Revision', 'Revisada_Por', 'Data_Publicacion_Publica',
    'Data_Publicacion_Privada'].forEach(function(nomeOpcional) {
    indice[nomeOpcional] = cabeceiras.indexOf(nomeOpcional);
  });

  return indice;
}
