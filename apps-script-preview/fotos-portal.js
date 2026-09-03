/**
 * MÓDULO DE FOTOGRAFÍAS DEL PORTAL SCPP
 * Sustituye por completo el fichero antiguo de fotografías de Apps Script.
 *
 * Compatible con las columnas actuales de la hoja Fotos:
 * Id_Foto, Foto, Titulo, Data, AnoAproximado, Lugar, Concerto, Evento,
 * PeFoto, Autor, Procedencia, DereitosUso, EstadoRevision,
 * Publicar_Publica, Destacada_Publica, Publicar_Privada, Destacada_Privada,
 * Calidade, Observacions, DataSubida, SubidaPor, Data_Revision, Revisada_Por,
 * Data_Publicacion_Publica, Data_Publicacion_Privada,
 * RutaR2_Publica, RutaR2_Privada, CategoriaPublica.
 */

function configurarFotosPortal() {
  PropertiesService.getScriptProperties().setProperties({
    FOTOS_FOLDER_ID: '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix',
    FOTOS_SPREADSHEET_ID: '1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w',
    FOTOS_SHEET_ID: '1291817000',
    FOTOS_APPSHEET_PATH: 'Fotos_Images/',
    FOTOS_NOTIFY_EMAIL: 'coralpolifonicapontevedra@gmail.com'
  });

  const contexto = obterContextoFotos_();
  console.log(
    'Configuración correcta: ' +
    contexto.folla.getParent().getName() +
    ' | ' +
    contexto.folla.getName()
  );
}

function probarPanelFotos() {
  const email = 'jcuinas@gmail.com';

  console.log('Correo utilizado na proba: ' + email);

  const resultado = listarFotosRevisionPortal_({
    email: email
  });

  console.log(JSON.stringify(resultado));
}

function subirFotoPortal_(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  const usuario = obterUsuarioWebPorEmail(email);

  if (!usuario) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  if (datos.confirmaDereitos !== true) {
    return {
      ok: false,
      erro: 'É necesario confirmar os dereitos da imaxe'
    };
  }

  const tipo = String(datos.tipo || '').trim().toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(tipo) === -1) {
    return { ok: false, erro: 'Formato de imaxe non compatible' };
  }

  const base64 = String(datos.base64 || '');
  const bytes = Utilities.base64Decode(base64);

  if (bytes.length > 8 * 1024 * 1024) {
    return {
      ok: false,
      erro: 'A fotografía supera o máximo de 8 MB'
    };
  }

  const contexto = obterContextoFotos_();
  const carpeta = DriveApp.getFolderById(contexto.folderId);

  const marca = Utilities.formatDate(
    new Date(),
    'Europe/Madrid',
    'yyyyMMdd-HHmmss'
  );

  const nomeLimpo = String(datos.nomeFicheiro || 'foto')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);

  const ficheiro = carpeta.createFile(
    Utilities.newBlob(bytes, tipo, marca + '-' + nomeLimpo)
  );

  const rutaAppSheet =
    String(contexto.appsheetPath || 'Fotos_Images/')
      .replace(/\/+$/, '') +
    '/' +
    ficheiro.getName();

  const idFoto = Utilities.getUuid();
  const agora = new Date();

  const rexistro = {
    Id_Foto: idFoto,
    Foto: rutaAppSheet,
    Titulo: String(datos.titulo || '').trim(),
    Data: String(datos.dataFoto || '').trim(),
    AnoAproximado: String(datos.anoAproximado || '').trim(),
    Lugar: String(datos.lugar || '').trim(),
    Concerto: String(datos.concerto || '').trim(),
    Evento: String(datos.evento || '').trim(),
    PeFoto: String(datos.peFoto || '').trim(),
    Autor: String(datos.autoria || '').trim(),
    Procedencia: String(datos.procedencia || '').trim(),
    DereitosUso: datos.confirmaDereitos === true
      ? 'Autorizada para a web'
      : '',
    EstadoRevision: 'Pendente',
    Publicar_Publica: false,
    Destacada_Publica: false,
    Publicar_Privada: false,
    Destacada_Privada: false,
    Calidade: '',
    Observacions: '',
    DataSubida: agora,
    SubidaPor: email,
    Data_Revision: '',
    Revisada_Por: '',
    Data_Publicacion_Publica: '',
    Data_Publicacion_Privada: '',
    RutaR2_Publica: '',
    RutaR2_Privada: '',
    CategoriaPublica: ''
  };

  try {
    appendRexistroPorCabeceiras_(contexto.folla, rexistro);
    SpreadsheetApp.flush();
  } catch (erro) {
    ficheiro.setTrashed(true);
    throw erro;
  }

  const correoAviso = String(
    PropertiesService.getScriptProperties()
      .getProperty('FOTOS_NOTIFY_EMAIL') ||
    'coralpolifonicapontevedra@gmail.com'
  ).trim();

  if (correoAviso) {
    try {
      MailApp.sendEmail({
        to: correoAviso,
        subject: 'Nova fotografía pendente de revisión',
        htmlBody:
          '<p>Recibiuse unha nova fotografía desde o portal privado.</p>' +
          '<p><strong>Título:</strong> ' +
          escaparHtmlFoto_(rexistro.Titulo) +
          '<br><strong>Enviada por:</strong> ' +
          escaparHtmlFoto_(email) +
          '<br><strong>Identificador:</strong> ' +
          escaparHtmlFoto_(idFoto) +
          '</p><p><a href="' +
          ficheiro.getUrl() +
          '">Abrir a imaxe en Drive</a></p>'
      });
    } catch (erroCorreo) {
      console.warn(
        'A fotografía gardouse, pero non se enviou o aviso: ' +
        String(erroCorreo && erroCorreo.message
          ? erroCorreo.message
          : erroCorreo)
      );
    }
  }

  return {
    ok: true,
    idFoto: idFoto,
    rowId: idFoto,
    mensaxe: 'Fotografía recibida e pendente de revisión'
  };
}

function listarFotosRevisionPortal_(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  const usuario = obterAdministradorFotosPortalV2_(email);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Administración non autorizada'
    };
  }

  const contexto = obterContextoFotos_();
  const rexistros = lerFotosComoObxectos_(contexto.folla);
  const carpeta = DriveApp.getFolderById(contexto.folderId);

  const fotos = rexistros
    .filter(function(foto) {
      return String(foto.EstadoRevision || '')
        .trim()
        .toLowerCase() === 'pendente';
    })
    .slice(0, 50)
    .map(function(foto) {
      const ficheiro = localizarFicheiroFoto_(
        carpeta,
        String(foto.Foto || '')
      );

      const fileId = ficheiro ? ficheiro.getId() : '';

      return {
        rowId: String(foto.Id_Foto || '').trim(),
        idFoto: String(foto.Id_Foto || '').trim(),
        titulo: String(foto.Titulo || '').trim(),
        data: String(foto.Data || '').trim(),
        dataFoto: String(foto.Data || '').trim(),
        anoAproximado: String(foto.AnoAproximado || '').trim(),
        lugar: String(foto.Lugar || '').trim(),
        concerto: String(foto.Concerto || '').trim(),
        evento: String(foto.Evento || '').trim(),
        peFoto: String(foto.PeFoto || '').trim(),
        autor: String(foto.Autor || '').trim(),
        autoria: String(foto.Autor || '').trim(),
        procedencia: String(foto.Procedencia || '').trim(),
        subidaPor: String(foto.SubidaPor || '').trim(),
        dataSubida: String(foto.DataSubida || '').trim(),
        observacions: String(foto.Observacions || '').trim(),
        miniaturaUrl: fileId
          ? 'https://drive.google.com/thumbnail?id=' +
            encodeURIComponent(fileId) +
            '&sz=w900'
          : '',
        ficheiroUrl: ficheiro ? ficheiro.getUrl() : ''
      };
    });

  return {
    ok: true,
    administrador: true,
    fotos: fotos
  };
}

function actualizarRevisionFotoPortal_(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  const usuario = obterAdministradorFotosPortalV2_(email);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Administración non autorizada'
    };
  }

  const estadoSolicitado = String(datos.estado || '').trim();

  if (['Aprobada', 'Rexeitada'].indexOf(estadoSolicitado) === -1) {
    return {
      ok: false,
      erro: 'Estado de revisión non válido'
    };
  }

  const contexto = obterContextoFotos_();
  const localizacion = localizarFilaFoto_(
    contexto.folla,
    String(datos.rowId || datos.idFoto || '').trim()
  );

  if (!localizacion) {
    return {
      ok: false,
      erro: 'Non se atopou a fotografía'
    };
  }

  const publicarPublica =
    estadoSolicitado === 'Aprobada' &&
    datos.publicarPublica === true;

  const publicarPrivada =
    estadoSolicitado === 'Aprobada' &&
    datos.publicarPrivada === true;

  const requirePublicacionR2 =
    publicarPublica || publicarPrivada;

  /*
   * Se debe publicarse, continúa como Pendente ata que R2 confirme
   * as copias e gardarRutasFotoR2Portal_ complete a operación.
   */
  const estadoGardado =
    estadoSolicitado === 'Aprobada' && requirePublicacionR2
      ? 'Pendente'
      : estadoSolicitado;

  const agora = new Date();

  const cambios = {
    EstadoRevision: estadoGardado,

    Publicar_Publica: publicarPublica,
    Destacada_Publica:
      publicarPublica && datos.destacadaPublica === true,

    Publicar_Privada: publicarPrivada,
    Destacada_Privada:
      publicarPrivada && datos.destacadaPrivada === true,

    Observacions: String(datos.observacions || '').trim(),
    Titulo: String(datos.titulo || '').trim(),
    PeFoto: String(datos.peFoto || '').trim(),

    /*
     * As datas finais só se escriben agora cando non hai publicación
     * pendente en R2. Se vai a R2, gardaranse ao finalizar.
     */
    Data_Revision: requirePublicacionR2 ? '' : agora,
    Revisada_Por: requirePublicacionR2 ? '' : email,
    Data_Publicacion_Publica: '',
    Data_Publicacion_Privada: ''
  };

  actualizarFilaPorCabeceiras_(
    contexto.folla,
    localizacion.numeroFila,
    localizacion.cabeceiras,
    cambios
  );

  SpreadsheetApp.flush();

  let mensaxe = 'Fotografía aceptada no arquivo sen publicar';

  if (estadoSolicitado === 'Rexeitada') {
    mensaxe = 'Fotografía marcada como rexeitada';
  } else if (publicarPublica && publicarPrivada) {
    mensaxe =
      'Fotografía preparada para copiar a R2 nas galerías pública e privada';
  } else if (publicarPublica) {
    mensaxe =
      'Fotografía preparada para copiar a R2 na galería pública';
  } else if (publicarPrivada) {
    mensaxe =
      'Fotografía preparada para copiar a R2 na galería privada';
  }

  return {
    ok: true,
    rowId: localizacion.idFoto,
    idFoto: localizacion.idFoto,

    /*
     * Mantemos o estado solicitado na resposta para que Cloudflare
     * continúe coa migración, aínda que na Sheet siga Pendente.
     */
    estado: estadoSolicitado,
    estadoGardado: estadoGardado,

    publicarPublica: publicarPublica,
    publicarPrivada: publicarPrivada,
    pendenteR2: requirePublicacionR2,
    mensaxe: mensaxe
  };
}

function listarFotosGaleriaPortal_() {
  const contexto = obterContextoFotos_();
  const fotos = lerFotosComoObxectos_(contexto.folla)
    .filter(function(foto) {
      return (
        valorBooleanoFotos_(foto.Publicar_Publica) &&
        String(foto.EstadoRevision || '').trim().toLowerCase() ===
          'aprobada'
      );
    })
    .map(function(foto) {
      return fotoGaleriaResposta_(foto, 'publica');
    });

  return { ok: true, fotos: fotos };
}

function listarFotosPublicadasPortal_(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  const usuario = obterUsuarioWebPorEmail(email);

  if (!usuario) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  const tipo = String(datos.tipo || 'privada')
    .trim()
    .toLowerCase();

  const contexto = obterContextoFotos_();
  const fotos = lerFotosComoObxectos_(contexto.folla)
    .filter(function(foto) {
      const aprobada =
        String(foto.EstadoRevision || '')
          .trim()
          .toLowerCase() === 'aprobada';

      if (!aprobada) return false;

      return tipo === 'publica'
        ? valorBooleanoFotos_(foto.Publicar_Publica)
        : valorBooleanoFotos_(foto.Publicar_Privada);
    })
    .map(function(foto) {
      return fotoGaleriaResposta_(foto, tipo);
    });

  return { ok: true, tipo: tipo, fotos: fotos };
}

function actualizarPublicacionFotoPortal_(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  const usuario = obterAdministradorFotosPortalV2_(email);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Administración non autorizada'
    };
  }

  const contexto = obterContextoFotos_();
  const localizacion = localizarFilaFoto_(
    contexto.folla,
    String(datos.rowId || datos.idFoto || '').trim()
  );

  if (!localizacion) {
    return { ok: false, erro: 'Non se atopou a fotografía' };
  }

  const agora = new Date();
  const publicarPublica = datos.publicarPublica === true;
  const publicarPrivada = datos.publicarPrivada === true;

  actualizarFilaPorCabeceiras_(
    contexto.folla,
    localizacion.numeroFila,
    localizacion.cabeceiras,
    {
      Publicar_Publica: publicarPublica,
      Destacada_Publica:
        publicarPublica && datos.destacadaPublica === true,
      Publicar_Privada: publicarPrivada,
      Destacada_Privada:
        publicarPrivada && datos.destacadaPrivada === true,
      Data_Publicacion_Publica: publicarPublica ? agora : '',
      Data_Publicacion_Privada: publicarPrivada ? agora : ''
    }
  );

  SpreadsheetApp.flush();

  return {
    ok: true,
    idFoto: localizacion.idFoto,
    rowId: localizacion.idFoto,
    mensaxe: 'Publicación actualizada correctamente'
  };
}

function obterFotoParaR2Portal_(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  const usuario = obterAdministradorFotosPortalV2_(email);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Administración non autorizada'
    };
  }

  const contexto = obterContextoFotos_();
  const localizacion = localizarFilaFoto_(
    contexto.folla,
    String(datos.idFoto || datos.rowId || '').trim()
  );

  if (!localizacion) {
    return { ok: false, erro: 'Non se atopou a fotografía' };
  }

  const foto = localizacion.rexistro;
  const carpeta = DriveApp.getFolderById(contexto.folderId);
  const ficheiro = localizarFicheiroFoto_(
    carpeta,
    String(foto.Foto || '')
  );

  if (!ficheiro) {
    return {
      ok: false,
      erro: 'Non se atopou o ficheiro da fotografía en Drive'
    };
  }

  const blob = ficheiro.getBlob();

  return {
    ok: true,
    idFoto: String(foto.Id_Foto || '').trim(),
    rowId: String(foto.Id_Foto || '').trim(),
    nomeFicheiro: ficheiro.getName(),
    mimeType:
      blob.getContentType() || 'application/octet-stream',
    base64: Utilities.base64Encode(blob.getBytes()),
    publicarPublica:
      valorBooleanoFotos_(foto.Publicar_Publica),
    publicarPrivada:
      valorBooleanoFotos_(foto.Publicar_Privada)
  };
}

function listarFotosPendentesR2Portal_(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  const usuario = obterAdministradorFotosPortalV2_(email);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Administración non autorizada'
    };
  }

  const contexto = obterContextoFotos_();
  const fotos = lerFotosComoObxectos_(contexto.folla)
    .filter(function(foto) {
      const publica = valorBooleanoFotos_(foto.Publicar_Publica);
      const privada = valorBooleanoFotos_(foto.Publicar_Privada);
      const faltaPublica =
        publica && !String(foto.RutaR2_Publica || '').trim();
      const faltaPrivada =
        privada && !String(foto.RutaR2_Privada || '').trim();

      return faltaPublica || faltaPrivada;
    })
    .map(function(foto) {
      return {
        idFoto: String(foto.Id_Foto || '').trim(),
        rowId: String(foto.Id_Foto || '').trim(),
        titulo: String(foto.Titulo || '').trim(),
        publicarPublica:
          valorBooleanoFotos_(foto.Publicar_Publica),
        publicarPrivada:
          valorBooleanoFotos_(foto.Publicar_Privada),
        rutaPublica: String(foto.RutaR2_Publica || '').trim(),
        rutaPrivada: String(foto.RutaR2_Privada || '').trim()
      };
    });

  return { ok: true, fotos: fotos };
}

function gardarRutasFotoR2Portal_(datos) {
  const email = String(datos.email || '').trim().toLowerCase();
  const usuario = obterAdministradorFotosPortalV2_(email);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Administración non autorizada'
    };
  }

  const contexto = obterContextoFotos_();
  const localizacion = localizarFilaFoto_(
    contexto.folla,
    String(datos.idFoto || datos.rowId || '').trim()
  );

  if (!localizacion) {
    return { ok: false, erro: 'Non se atopou a fotografía' };
  }

  actualizarFilaPorCabeceiras_(
    contexto.folla,
    localizacion.numeroFila,
    localizacion.cabeceiras,
    {
      RutaR2_Publica: String(datos.rutaPublica || '').trim(),
      RutaR2_Privada: String(datos.rutaPrivada || '').trim()
    }
  );

  SpreadsheetApp.flush();

  return {
    ok: true,
    idFoto: localizacion.idFoto,
    rowId: localizacion.idFoto,
    mensaxe: 'Rutas R2 gardadas correctamente'
  };
}

/* =========================
   FUNCIÓNS AUXILIARES
   ========================= */

function obterContextoFotos_() {
  const propiedades =
    PropertiesService.getScriptProperties();

  const spreadsheetId = String(
    propiedades.getProperty('FOTOS_SPREADSHEET_ID') ||
    '1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w'
  ).trim();

  const sheetId = Number(
    propiedades.getProperty('FOTOS_SHEET_ID') ||
    '1291817000'
  );

  const folderId = String(
    propiedades.getProperty('FOTOS_FOLDER_ID') ||
    '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix'
  ).trim();

  const appsheetPath = String(
    propiedades.getProperty('FOTOS_APPSHEET_PATH') ||
    'Fotos_Images/'
  ).trim();

  if (!spreadsheetId || !sheetId || !folderId) {
    throw new Error(
      'Falta a configuración do módulo Fotos'
    );
  }

  const libro = SpreadsheetApp.openById(spreadsheetId);
  const folla = libro.getSheetById(sheetId);

  if (!folla || folla.getName() !== 'Fotos') {
    throw new Error(
      'Non se atopou a folla Fotos co ID configurado'
    );
  }

  validarCabeceirasFotos_(folla);

  return {
    folla: folla,
    folderId: folderId,
    appsheetPath: appsheetPath
  };
}

function obterAdministradorFotosPortalV2_(email) {
  const correo = String(email || '')
    .trim()
    .toLowerCase();

  const usuario = buscarUsuarioWebPorEmail_(correo);

  console.log(
    'Comprobación permisos Fotos: ' +
    JSON.stringify(usuario)
  );

  const modulos = String(
    usuario && usuario.modulosPermitidos || ''
  ).split(',').map(function(valor) {
    return String(valor || '').trim().toLowerCase();
  });

  const podeRevisar =
    usuario &&
    usuario.activo === true &&
    (
      usuario.administrador === true ||
      modulos.indexOf('revisarfotos') !== -1
    );

  if (!podeRevisar) {
    return null;
  }

  return usuario;
}
function validarCabeceirasFotos_(folla) {
  const cabeceiras = folla
    .getRange(1, 1, 1, folla.getLastColumn())
    .getDisplayValues()[0]
    .map(function(valor) {
      return String(valor || '').trim();
    });

  const obrigatorias = [
    'Id_Foto',
    'Foto',
    'Titulo',
    'EstadoRevision',
    'Publicar_Publica',
    'Destacada_Publica',
    'Publicar_Privada',
    'Destacada_Privada',
    'Observacions',
    'DataSubida',
    'SubidaPor'
  ];

  const faltan = obrigatorias.filter(function(nome) {
    return cabeceiras.indexOf(nome) === -1;
  });

  if (faltan.length) {
    throw new Error(
      'Faltan columnas na folla Fotos: ' +
      faltan.join(', ')
    );
  }
}

function lerFotosComoObxectos_(folla) {
  const valores = folla.getDataRange().getDisplayValues();

  if (valores.length < 2) {
    return [];
  }

  const cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });

  return valores
    .slice(1)
    .filter(function(fila) {
      return fila.some(function(valor) {
        return String(valor || '').trim() !== '';
      });
    })
    .map(function(fila) {
      const rexistro = {};

      cabeceiras.forEach(function(cabeceira, indice) {
        rexistro[cabeceira] =
          fila[indice] === undefined ? '' : fila[indice];
      });

      return rexistro;
    });
}

function localizarFilaFoto_(folla, idFoto) {
  idFoto = String(idFoto || '').trim();

  if (!idFoto) return null;

  const valores = folla.getDataRange().getValues();
  if (valores.length < 2) return null;

  const cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });

  const indiceId = cabeceiras.indexOf('Id_Foto');

  if (indiceId === -1) {
    throw new Error(
      'Falta a columna Id_Foto na folla Fotos'
    );
  }

  for (let i = 1; i < valores.length; i += 1) {
    if (
      String(valores[i][indiceId] || '').trim() === idFoto
    ) {
      const rexistro = {};

      cabeceiras.forEach(function(cabeceira, indice) {
        rexistro[cabeceira] =
          valores[i][indice] === undefined
            ? ''
            : valores[i][indice];
      });

      return {
        numeroFila: i + 1,
        idFoto: idFoto,
        cabeceiras: cabeceiras,
        rexistro: rexistro
      };
    }
  }

  return null;
}

function actualizarFilaPorCabeceiras_(
  folla,
  numeroFila,
  cabeceiras,
  cambios
) {
  Object.keys(cambios).forEach(function(cabeceira) {
    const indice = cabeceiras.indexOf(cabeceira);

    if (indice !== -1) {
      folla
        .getRange(numeroFila, indice + 1)
        .setValue(cambios[cabeceira]);
    }
  });
}

function appendRexistroPorCabeceiras_(folla, rexistro) {
  const cabeceiras = folla
    .getRange(1, 1, 1, folla.getLastColumn())
    .getDisplayValues()[0]
    .map(function(valor) {
      return String(valor || '').trim();
    });

  folla.appendRow(
    cabeceiras.map(function(cabeceira) {
      return Object.prototype.hasOwnProperty.call(
        rexistro,
        cabeceira
      )
        ? rexistro[cabeceira]
        : '';
    })
  );
}

function localizarFicheiroFoto_(carpeta, ruta) {
  const nome = String(ruta || '')
    .trim()
    .split('/')
    .pop();

  if (!nome) return null;

  const ficheiros = carpeta.getFilesByName(nome);
  return ficheiros.hasNext() ? ficheiros.next() : null;
}

function fotoGaleriaResposta_(foto, tipo) {
  tipo = String(tipo || 'publica').toLowerCase();

  const rutaR2 = tipo === 'publica'
    ? String(foto.RutaR2_Publica || '').trim()
    : String(foto.RutaR2_Privada || '').trim();

  return {
    idFoto: String(foto.Id_Foto || '').trim(),
    rowId: String(foto.Id_Foto || '').trim(),
    titulo: String(foto.Titulo || '').trim(),
    data: String(foto.Data || '').trim(),
    anoAproximado:
      String(foto.AnoAproximado || '').trim(),
    lugar: String(foto.Lugar || '').trim(),
    concerto: String(foto.Concerto || '').trim(),
    evento: String(foto.Evento || '').trim(),
    peFoto: String(foto.PeFoto || '').trim(),
    autor: String(foto.Autor || '').trim(),
    procedencia: String(foto.Procedencia || '').trim(),
    categoriaPublica:
      String(foto.CategoriaPublica || '').trim(),
    destacada: tipo === 'publica'
      ? valorBooleanoFotos_(foto.Destacada_Publica)
      : valorBooleanoFotos_(foto.Destacada_Privada),
    rutaR2: rutaR2,
    foto: String(foto.Foto || '').trim()
  };
}

function valorBooleanoFotos_(valor) {
  if (valor === true) return true;

  return [
    'true',
    'verdadero',
    'verdadeiro',
    'si',
    'sí',
    'yes',
    'y',
    '1'
  ].indexOf(
    String(valor || '').trim().toLowerCase()
  ) !== -1;
}

function escaparHtmlFoto_(valor) {
  return String(valor || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

