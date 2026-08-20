function configurarProba() {
  const propiedades = PropertiesService.getScriptProperties();

  const token =
    Utilities.getUuid().replaceAll('-', '') +
    Utilities.getUuid().replaceAll('-', '');

  propiedades.setProperties({
    WEB_WRITE_TOKEN: token,
    WEB_TEST_EMAIL: Session
      .getEffectiveUser()
      .getEmail()
      .toLowerCase()
  });

  console.log('Configuración creada correctamente.');
  console.log(
    'Correo autorizado: ' +
    propiedades.getProperty('WEB_TEST_EMAIL')
  );
}
function doGet(e) {
  try {
    const recurso = String(
      e && e.parameter ? e.parameter.recurso || '' : ''
    )
      .trim()
      .toLowerCase();

    if (recurso === 'publicacions') {
      return respostaJSON(listarPublicacionsWeb_());
    }

    return respostaJSON({
      ok: true,
      servizo: 'UsuariosWeb',
      escritura: 'protexida'
    });

  } catch (erro) {
    console.error(
      erro && erro.stack ? erro.stack : erro
    );

    return respostaJSON({
      ok: false,
      erro: String(
        erro && erro.message
          ? erro.message
          : 'Non foi posible completar a solicitude'
      )
    });
  }
}

/**
 * Executar unha soa vez desde o editor de Apps Script antes de publicar
 * unha nova versión do Web App.
 *
 * - Garda de forma explícita o libro de UsuariosWeb.
 * - Localiza e garda o libro de Persoas.
 * - Comproba as cabeceiras necesarias para o primeiro acceso.
 *
 * A procura en Drive só se usa nesta configuración inicial. As peticións
 * posteriores do Portal abren ambos os libros directamente polos seus IDs.
 */
function configurarPortalSCPP() {
  const propiedades =
    PropertiesService.getScriptProperties();

  const libroUsuarios =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!libroUsuarios) {
    throw new Error(
      'Este proxecto debe estar vinculado ao arquivo que contén UsuariosWeb.'
    );
  }

  const follaUsuarios =
    libroUsuarios.getSheetByName('UsuariosWeb');

  if (!follaUsuarios) {
    throw new Error(
      'O arquivo activo non contén a pestana UsuariosWeb.'
    );
  }

  validarCabeceirasPortal_(
    follaUsuarios,
    [
      'Row ID',
      'Persoa',
      'Email',
      'Nome',
      'Activo',
      'Administrador',
      'ModulosPermitidos',
      'DataAlta',
      'DataBaixa',
      'Observacions'
    ],
    'UsuariosWeb'
  );

  propiedades.setProperty(
    'USUARIOS_WEB_SPREADSHEET_ID',
    libroUsuarios.getId()
  );

  const follaPersoas = obterFollaPersoas_();

  validarCabeceirasNormalizadasPortal_(
    follaPersoas,
    {
      email: [
        'email',
        'correoelectronico',
        'correo',
        'mail'
      ],
      activo: ['activo', 'activa', 'estado'],
      rowId: ['rowid', 'idpersoa', 'id']
    },
    'Persoas'
  );

  propiedades.setProperty(
    'PERSOAS_SPREADSHEET_ID',
    follaPersoas.getParent().getId()
  );

  console.log(
    'Portal configurado correctamente. UsuariosWeb: ' +
    libroUsuarios.getId() +
    ' | Persoas: ' +
    follaPersoas.getParent().getId()
  );
}


function doPost(e) {
  const bloqueo = LockService.getScriptLock();
  let correo = '';
  let accion = '';

  try {
    const datos = JSON.parse(
      e.postData?.contents || '{}'
    );

    accion = String(datos.accion || '').trim();

    const propiedades =
      PropertiesService.getScriptProperties();

    const tokenCorrecto =
      propiedades.getProperty('WEB_WRITE_TOKEN');

    const correoPermitido = String(
      propiedades.getProperty('WEB_TEST_EMAIL') || ''
    )
      .trim()
      .toLowerCase();

    correo = String(
      datos.email ||
      datos.correoElectronico ||
      ''
    )
      .trim()
      .toLowerCase();

    if (!tokenCorrecto || datos.token !== tokenCorrecto) {
      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Intento de escritura',
        modulo: 'UsuariosWeb',
        resultado: 'Rexeitado',
        detalle: 'Token incorrecto ou ausente'
      });

      return respostaJSON({
        ok: false,
        erro: 'Non autorizado'
      });
    }

    if (accion === 'rexistrarSolicitudeWeb') {
      bloqueo.waitLock(10000);
      return respostaJSON(
        rexistrarSolicitudeWeb_(datos)
      );
    }

    if (accion === 'obterTextoLegalVixente') {
      return respostaJSON({
        ok: true,
        textoLegal: obterTextoLegalVixente_()
      });
    }

    if (accion === 'comprobarAceptacion') {
      const usuarioExistente =
        buscarUsuarioWebPorEmail_(correo);

      if (
        (usuarioExistente && !usuarioExistente.activo) ||
        (!usuarioExistente && !obterPersoaActivaPorEmail_(correo))
      ) {
        rexistrarAcceso({
          email: correo,
          tipoEvento: 'Comprobar acceso ao portal',
          modulo: 'Portal',
          resultado: 'Rexeitado',
          detalle: 'O correo non corresponde a unha persoa activa'
        });

        return respostaJSON({
          ok: false,
          erro: 'Usuario non autorizado'
        });
      }

      return respostaJSON(
        comprobarAceptacionPortal_(correo)
      );
    }
    if (accion === 'rexistrarAceptacion') {
      if (datos.aceptaFines !== true) {
        rexistrarAcceso({
          email: correo,
          tipoEvento: 'Aceptar protección de datos',
          modulo: 'Aceptacion',
          resultado: 'Rexeitado',
          detalle: 'Non se confirmou a aceptación'
        });

        return respostaJSON({
          ok: false,
          erro: 'É necesario confirmar a aceptación'
        });
      }

      bloqueo.waitLock(10000);

      const resultadoAceptacion =
        rexistrarAceptacionPortal_(correo);

      if (!resultadoAceptacion.ok) {
        rexistrarAcceso({
          email: correo,
          tipoEvento: 'Aceptar protección de datos',
          modulo: 'Aceptacion',
          resultado: 'Rexeitado',
          detalle: String(
            resultadoAceptacion.erro ||
            'Usuario inexistente ou inactivo'
          )
        });
        return respostaJSON(resultadoAceptacion);
      }

      rexistrarAcceso({
        persoa: resultadoAceptacion.usuario.persoa,
        usuarioWeb: resultadoAceptacion.usuario.usuarioWeb,
        email: correo,
          tipoEvento: 'Aceptar protección de datos',
        modulo: 'Aceptacion',
        resultado: 'Correcto',
        detalle:
          'Aceptación ' +
          resultadoAceptacion.version +
          ' rexistrada desde a web privada'
      });

      return respostaJSON({
        ok: true,
        mensaxe: resultadoAceptacion.mensaxe,
        version: resultadoAceptacion.version
      });
    }
    if (accion === 'obterPerfil') {
      const resultadoPerfil = obterPerfilPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Consulta do perfil',
        modulo: 'Perfil',
        resultado: resultadoPerfil.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultadoPerfil.ok
          ? 'Consulta da ficha persoal'
          : String(resultadoPerfil.erro || 'Erro descoñecido')
      });

      return respostaJSON(resultadoPerfil);
    }

    if (accion === 'actualizarPerfil') {
      bloqueo.waitLock(10000);

      const resultadoPerfil = actualizarPerfilPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Actualización do perfil',
        modulo: 'Perfil',
        resultado: resultadoPerfil.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultadoPerfil.ok
          ? 'Datos persoais actualizados'
          : String(resultadoPerfil.erro || 'Erro descoñecido')
      });

      return respostaJSON(resultadoPerfil);
    }

    if (accion === 'obterDocumentoConcerto') {
      const resultadoDocumento = obterDocumentoConcerto_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Consulta de documento',
        modulo: 'Concertos',
        resultado: resultadoDocumento.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultadoDocumento.ok
          ? 'Programa de man consultado'
          : String(resultadoDocumento.erro || 'Erro descoñecido')
      });

      return respostaJSON(resultadoDocumento);
    }

    if (accion === 'subirFoto') {
      bloqueo.waitLock(10000);

      const resultadoFoto = subirFotoPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Achegar fotografía',
        modulo: 'Fotos',
        resultado: resultadoFoto.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultadoFoto.ok
          ? 'Fotografía enviada para revisión'
          : String(resultadoFoto.erro || 'Erro descoñecido')
      });

      return respostaJSON(resultadoFoto);
    }

    if (accion === 'listarFotosRevision') {
      return respostaJSON(
        listarFotosRevisionPortal_(datos)
      );
    }

    if (accion === 'listarFotosGaleria') {
      return respostaJSON(
        listarFotosGaleriaPortal_()
      );
    }

    if (accion === 'actualizarRevisionFoto') {
      bloqueo.waitLock(10000);
      const resultadoRevision =
        actualizarRevisionFotoPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Revisar fotografía',
        modulo: 'Fotos',
        resultado: resultadoRevision.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultadoRevision.ok
          ? String(resultadoRevision.estado || '')
          : String(resultadoRevision.erro || 'Erro descoñecido')
      });

      return respostaJSON(resultadoRevision);
    }

    if (accion === 'listarFotosPublicadas') {
      return respostaJSON(
        listarFotosPublicadasPortal_(datos)
      );
    }

    if (accion === 'actualizarPublicacionFoto') {
      return respostaJSON(
        actualizarPublicacionFotoPortal_(datos)
      );
    }

    if (accion === 'obterFotoParaR2') {
      return respostaJSON(
        obterFotoParaR2Portal_(datos)
      );
    }

    if (accion === 'listarFotosPendentesR2') {
      return respostaJSON(
        listarFotosPendentesR2Portal_(datos)
      );
    }

    if (accion === 'gardarRutasFotoR2') {
      return respostaJSON(
        gardarRutasFotoR2Portal_(datos)
      );
    }

    if (accion === 'listarRepertorioPortal') {
      const resultado =
        listarRepertorioPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Consultar repertorio',
        modulo: 'Repertorio',
        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultado.ok
          ? 'Repertorio consultado desde o Portal'
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

    if (accion === 'listarAsistenciasConcertosPortal') {
      const resultado =
        listarAsistenciasConcertosPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Consultar asistentes a concertos',
        modulo: 'Concertos',
        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultado.ok
          ? 'Asistencias consultadas desde o Portal'
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }
    // Administración → Concertos: dispatcher modular común a Preview e Produción.
    const respostaConcertosAdmin =
      despacharConcertosAdministracion_(accion, datos, bloqueo);

    if (respostaConcertosAdmin !== null) {
      return respostaJSON(respostaConcertosAdmin);
    }

    if (accion === 'listarEnsaiosPortal') {
      const resultado =
        listarEnsaiosPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Consultar ensaios',
        modulo: 'Ensaios',
        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultado.ok
          ? 'Ensaios consultados desde o Portal'
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

    if (accion === 'gardarAsistenciaEnsaioPortal') {
      bloqueo.waitLock(10000);

      const resultado =
        gardarAsistenciaEnsaioPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Rexistrar asistencia a ensaio',
        modulo: 'Ensaios',
        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultado.ok
          ? 'Asistencia rexistrada desde o Portal'
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

    if (accion === 'gardarEnsaioRepertorioPortal') {
      bloqueo.waitLock(10000);

      const resultado =
        gardarEnsaioRepertorioPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Rexistrar obra traballada',
        modulo: 'Ensaios',
        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultado.ok
          ? 'Obra traballada rexistrada desde o Portal'
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

if (accion === 'eliminarEnsaioPortal') {
  bloqueo.waitLock(10000);

  const resultado = eliminarEnsaioPortal_(datos);

  rexistrarAcceso({
    email: correo,
    tipoEvento: 'Eliminar ensaio',
    modulo: 'Ensaios',
    resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
    detalle: resultado.ok
      ? 'Ensaio eliminado desde o Portal'
      : String(resultado.erro || '')
  });

  return respostaJSON(resultado);
}

if (accion === 'eliminarFotoPortal') {
  bloqueo.waitLock(10000);

  const resultado = eliminarFotoPortal_(datos);

  rexistrarAcceso({
    email: correo,
    tipoEvento: 'Eliminar fotografía',
    modulo: 'Fotos',
    resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
    detalle: resultado.ok
      ? 'Fotografía eliminada desde o Portal'
      : String(resultado.erro || '')
  });

  return respostaJSON(resultado);
}

if (accion === 'eliminarEnsaioRepertorioPortal') {
  bloqueo.waitLock(10000);

  const resultado =
    eliminarEnsaioRepertorioPortal_(datos);

  rexistrarAcceso({
    email: correo,
    tipoEvento: 'Eliminar obra de ensaio',
    modulo: 'Ensaios',
    resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
    detalle: resultado.ok
      ? 'Obra eliminada do ensaio'
      : String(resultado.erro || '')
  });

  return respostaJSON(resultado);
}

if (accion === 'gardarEnsaioPortal') {
  bloqueo.waitLock(10000);
  const resultado =
    gardarEnsaioPortal_(datos);

  rexistrarAcceso({
    email: correo,
    tipoEvento: 'Crear ensaio',
    modulo: 'Ensaios',
    resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
    detalle: resultado.ok
      ? 'Ensaio creado desde o Portal'
      : String(resultado.erro || '')
  });

  return respostaJSON(resultado);
}

    if (accion === 'obterSeguimentoEnsaiosPortal') {
      const resultado =
        obterSeguimentoEnsaiosPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Consultar seguimento de ensaios',
        modulo: 'Ensaios',
        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultado.ok
          ? 'Seguimento de ensaios consultado'
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

    if (accion === 'obterFicheiroRepertorio') {
      return respostaJSON(
        obterFicheiroRepertorio_(datos)
      );
    }

    if (accion === 'listarDocumentacionPortal') {
      const resultado =
        listarDocumentacionPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Consultar documentación',
        modulo: 'Documentación',
        resultado: resultado.ok
          ? 'Correcto'
          : 'Rexeitado',
        detalle: resultado.ok
          ? 'Documentación consultada desde o Portal'
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

    if (accion === 'obterFicheiroDocumentacion') {
      const resultado =
        obterFicheiroDocumentacion_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Abrir documento',
        modulo: 'Documentación',
        resultado: resultado.ok
          ? 'Correcto'
          : 'Rexeitado',
        detalle: resultado.ok
          ? String(resultado.nomeFicheiro || '')
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

    if (accion === 'listarPersoasAdministracion') {
      const resultado =
        listarPersoasAdministracion_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Consultar persoas',
        modulo: 'Administración',
        resultado: resultado.ok
          ? 'Correcto'
          : 'Rexeitado',
        detalle: resultado.ok
          ? 'Listaxe de persoas consultada'
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

    if (accion === 'obterFichaPersoaAdministracion') {
      const resultado =
        obterFichaPersoaAdministracion_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Abrir ficha persoal',
        modulo: 'Administración',
        resultado: resultado.ok
          ? 'Correcto'
          : 'Rexeitado',
        detalle: resultado.ok
          ? String(resultado.nomeFicheiro || '')
          : String(resultado.erro || '')
      });

      return respostaJSON(resultado);
    }

    if (accion === 'actualizarObservacions') {
      const observacions = String(
        datos.observacions || ''
      ).trim();

      if (!correo || correo !== correoPermitido) {
        rexistrarAcceso({
          email: correo,
          tipoEvento: 'Actualizar observacións',
          modulo: 'UsuariosWeb',
          resultado: 'Rexeitado',
          detalle: 'Usuario non autorizado para esta proba'
        });

        return respostaJSON({
          ok: false,
          erro: 'Usuario non autorizado para esta proba'
        });
      }

      if (!observacions || observacions.length > 500) {
        rexistrarAcceso({
          email: correo,
          tipoEvento: 'Actualizar observacións',
          modulo: 'UsuariosWeb',
          resultado: 'Rexeitado',
          detalle:
            'Contido baleiro ou superior a 500 caracteres'
        });

        return respostaJSON({
          ok: false,
          erro:
            'As observacións deben ter entre 1 e 500 caracteres'
        });
      }

      bloqueo.waitLock(10000);

      const follaUsuarios =
        obterFollaUsuariosWeb_();

      if (!follaUsuarios) {
        throw new Error(
          'Non se atopou a pestana UsuariosWeb'
        );
      }

      const valores =
        follaUsuarios.getDataRange().getValues();

      if (valores.length < 2) {
        rexistrarAcceso({
          email: correo,
          tipoEvento: 'Actualizar observacións',
          modulo: 'UsuariosWeb',
          resultado: 'Erro',
          detalle: 'Non hai usuarios rexistrados'
        });

        return respostaJSON({
          ok: false,
          erro: 'Non hai usuarios rexistrados'
        });
      }

      const cabeceiras = valores[0].map(function(valor) {
        return String(valor).trim();
      });

      const columnaRowId =
        cabeceiras.indexOf('Row ID');
      const columnaPersoa =
        cabeceiras.indexOf('Persoa');
      const columnaEmail =
        cabeceiras.indexOf('Email');
      const columnaObservacions =
        cabeceiras.indexOf('Observacions');

      if (
        columnaRowId === -1 ||
        columnaPersoa === -1 ||
        columnaEmail === -1 ||
        columnaObservacions === -1
      ) {
        throw new Error(
          'Non se atoparon as columnas Row ID, Persoa, ' +
          'Email ou Observacions en UsuariosWeb'
        );
      }

      const indiceFila = valores.findIndex(
        function(fila, indice) {
          return (
            indice > 0 &&
            String(fila[columnaEmail])
              .trim()
              .toLowerCase() === correo
          );
        }
      );

      if (indiceFila === -1) {
        rexistrarAcceso({
          email: correo,
          tipoEvento: 'Actualizar observacións',
          modulo: 'UsuariosWeb',
          resultado: 'Rexeitado',
          detalle: 'Non se atopou o usuario autorizado'
        });

        return respostaJSON({
          ok: false,
          erro: 'Non se atopou o usuario autorizado'
        });
      }

      const filaUsuario = valores[indiceFila];

      const usuarioWebId = String(
        filaUsuario[columnaRowId] || ''
      ).trim();

      const persoaId = String(
        filaUsuario[columnaPersoa] || ''
      ).trim();

      follaUsuarios
        .getRange(
          indiceFila + 1,
          columnaObservacions + 1
        )
        .setValue(observacions);

      rexistrarAcceso({
        persoa: persoaId,
        usuarioWeb: usuarioWebId,
        email: correo,
        tipoEvento: 'Actualizar observacións',
        modulo: 'UsuariosWeb',
        resultado: 'Correcto',
        detalle:
          'Observacións actualizadas desde a web de proba'
      });

      SpreadsheetApp.flush();

      return respostaJSON({
        ok: true,
        mensaxe:
          'Observacións actualizadas correctamente'
      });
    }

    rexistrarAcceso({
      email: correo,
      tipoEvento: String(
        accion || 'Acción descoñecida'
      ),
      modulo: 'UsuariosWeb',
      resultado: 'Rexeitado',
      detalle: 'Acción non permitida'
    });

    return respostaJSON({
      ok: false,
      erro: 'Acción non permitida'
    });

  } catch (erro) {
    console.error(
      erro && erro.stack ? erro.stack : erro
    );

    rexistrarAcceso({
      email: correo,
      tipoEvento:
        accion === 'rexistrarAceptacion'
          ? 'Aceptar protección de datos'
          : (
            accion === 'comprobarAceptacion'
              ? 'Comprobar acceso ao portal'
              : 'Erro no Portal'
          ),
      modulo:
        accion === 'rexistrarAceptacion' ||
        accion === 'comprobarAceptacion'
          ? 'Portal'
          : 'UsuariosWeb',
      resultado: 'Erro',
      detalle: String(
        erro && erro.message
          ? erro.message
          : erro
      )
    });

    return respostaJSON({
      ok: false,
      erro: String(
        erro && erro.message
          ? erro.message
          : 'Non foi posible completar o acceso'
      ),
      detalle: String(
        erro && erro.message
          ? erro.message
          : erro
      )
    });

  } finally {
    if (bloqueo.hasLock()) {
      bloqueo.releaseLock();
    }
  }
}
function listarRepertorioPortal_(datos) {
  const correo = String(datos.email || '')
    .trim()
    .toLowerCase();

  const usuario = obterUsuarioWebPorEmail(correo);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Usuario non autorizado'
    };
  }

  const ids = {
    repertorio:
      '1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw',
    audios:
      '16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0',
    partituras:
      '18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0',
    programas:
      '1NyOt3A8EQ-HFBguDlsqaBQ0TpdlslI0GkRQzGXZkOig',
    concertos:
      '1vYlC1VO1hql8jJVkt1OBXnbH7GvUVe4XXe5TSIJk2dU'
  };

  const repertorio = lerFollaRepertorio_(
    ids.repertorio,
    'Repertorio'
  );

  const audios = lerFollaRepertorio_(
    ids.audios,
    'AudiosRepertorio'
  );

  const partituras = lerFollaRepertorio_(
    ids.partituras,
    'Partituras'
  );

  const programas = lerFollaRepertorio_(
    ids.programas,
    'ConcertosRepertorio'
  );

  const concertos = lerFollaRepertorio_(
    ids.concertos,
    'Concertos'
  );

  const concertosPorId = {};

  concertos.forEach(function(concerto) {
    concertosPorId[String(concerto.Id || '').trim()] =
      concerto;
  });

  const ordeVoces = {
    Soprano: 1,
    Soprano2: 2,
    Contraalto: 3,
    Contraalto2: 4,
    Tenor: 5,
    Tenor2: 6,
    Baixo: 7,
    Audioxeral: 8
  };

  const obras = repertorio
    .filter(function(obra) {
      return String(obra.Id || '').trim();
    })
    .map(function(obra) {
      const idObra = String(obra.Id || '').trim();

      const partiturasObra = partituras
        .filter(function(partitura) {
          return (
            String(partitura.Id_Repertorio || '').trim() ===
              idObra &&
            valorBooleanoPortal_(partitura.Activa)
          );
        })
        .map(function(partitura) {
          return {
            id: String(
              partitura.Id_Partitura || ''
            ).trim(),
            nome: String(
              partitura.Nomepartitura || ''
            ).trim(),
            voz: String(partitura.Voz || '').trim(),
            version: String(
              partitura['Versión'] || ''
            ).trim(),
            ruta: String(partitura.PDF || '').trim()
          };
        });

      const audiosObra = audios
        .filter(function(audio) {
          return (
            String(audio.NomeObra || '').trim() ===
              idObra &&
            valorBooleanoPortal_(audio.Activo)
          );
        })
        .map(function(audio) {
          return {
            id: String(audio.Id_Audio || '').trim(),
            voz: String(audio.Voz || '').trim(),
            tipo: String(
              audio.TipoAudio || ''
            ).trim(),
            ruta: String(
              audio.AudioFile || ''
            ).trim(),
            observacions: String(
              audio['Observacións'] || ''
            ).trim()
          };
        })
        .sort(function(a, b) {
          return (
            (ordeVoces[a.voz] || 99) -
            (ordeVoces[b.voz] || 99)
          );
        });

      const concertosObra = programas
        .filter(function(programa) {
          return String(
            programa.Id_Obras || ''
          ).trim() === idObra;
        })
        .map(function(programa) {
          const idConcerto = String(
            programa.Id_Conciertos || ''
          ).trim();

          const concerto =
            concertosPorId[idConcerto] || {};

          return {
            id: idConcerto,
            data: String(concerto.Data || '').trim(),
            nome: String(concerto.Nome || '').trim(),
            cidade: String(
              concerto.Cidade || ''
            ).trim(),
            lugar: String(concerto.Lugar || '').trim(),
            orde: String(programa.Orde || '').trim(),
            solista: String(
              programa.Solista || ''
            ).trim(),
            notas: String(programa.Notas || '').trim()
          };
        });

      return {
        id: idObra,
        nomeObra: String(
          obra.NomeObra || ''
        ).trim(),
        autorLetra: String(
          obra.AutorLetra || ''
        ).trim(),
        compositor: String(
          obra.Compositor || ''
        ).trim(),
        datas: String(
          obra['Nac/fall'] || ''
        ).trim(),
        comentarios: String(
          obra.Comentarios || ''
        ).trim(),
        partituras: partiturasObra,
        audios: audiosObra,
        concertos: concertosObra
      };
    });

  return {
    ok: true,
    obras: obras
  };
}


function listarAsistenciasConcertosPortal_(datos) {
  const correo = String(datos.email || '')
    .trim()
    .toLowerCase();

  const usuario = obterUsuarioWebPorEmail(correo);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Usuario non autorizado'
    };
  }

  const asistencias = lerFollaRepertorio_(
    '1pObayoj3uoPLtqUqQG9S5GZ0afRz9ErBeJbTgJlaiH0',
    'AsistenciasConcertos'
  );

  const ordeVoces = {
    Soprano: 1,
    Contralto: 2,
    Tenor: 3,
    Baixo: 4
  };

  const porConcerto = {};

  asistencias.forEach(function(asistencia) {
    const idConcerto = String(
      asistencia.Concerto || ''
    ).trim();

    const nome = String(
      asistencia.Nome_Completo ||
      asistencia['Nome e apelidos'] ||
      ''
    ).trim();

    const voz = String(
      asistencia.Voz || 'Sen voz indicada'
    ).trim();

    if (!idConcerto || !nome) {
      return;
    }

    if (!porConcerto[idConcerto]) {
      porConcerto[idConcerto] = [];
    }

    const repetida = porConcerto[idConcerto].some(
      function(persoa) {
        return (
          persoa.nome === nome &&
          persoa.voz === voz
        );
      }
    );

    if (!repetida) {
      porConcerto[idConcerto].push({
        nome: nome,
        voz: voz
      });
    }
  });

  Object.keys(porConcerto).forEach(function(idConcerto) {
    porConcerto[idConcerto].sort(function(a, b) {
      const diferenzaVoz =
        (ordeVoces[a.voz] || 99) -
        (ordeVoces[b.voz] || 99);

      if (diferenzaVoz !== 0) {
        return diferenzaVoz;
      }

      return a.nome.localeCompare(
        b.nome,
        'gl',
        { sensitivity: 'base' }
      );
    });
  });

  return {
    ok: true,
    asistenciasPorConcerto: porConcerto
  };
}


function lerFollaRepertorio_(spreadsheetId, nomeFolla) {
  const folla = SpreadsheetApp
    .openById(spreadsheetId)
    .getSheetByName(nomeFolla);

  if (!folla) {
    throw new Error(
      'Non se atopou a folla ' + nomeFolla
    );
  }

  const valores = folla
    .getDataRange()
    .getDisplayValues();

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
        return String(valor || '').trim();
      });
    })
    .map(function(fila) {
      const rexistro = {};

      cabeceiras.forEach(function(cabeceira, indice) {
        rexistro[cabeceira] =
          fila[indice] === undefined
            ? ''
            : fila[indice];
      });

      return rexistro;
    });
}


function obterFicheiroRepertorio_(datos) {
  const correo = String(datos.email || '')
    .trim()
    .toLowerCase();

  const usuario = obterUsuarioWebPorEmail(correo);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Usuario non autorizado'
    };
  }

  const ruta = String(datos.ruta || '').trim();

  const carpetasPermitidas = {
    'Obras_Files_':
      '1QAt_iu_C2m7jfoTfC9dh5SePWNf0iULU',
    'Partituras_Files_':
      '1ZbqnD4Gda7gkJrQOLE-eNhiLboz7iqJm',
    'AudiosRepertorio_Files_':
      '1lDDdv0iUTqY70rVN0NjIe7XE5ovI5T-V'
  };

  const partes = ruta.split('/');

  if (
    partes.length !== 2 ||
    !carpetasPermitidas[partes[0]] ||
    !partes[1]
  ) {
    return {
      ok: false,
      erro: 'Ruta de ficheiro non permitida'
    };
  }

  const carpeta = DriveApp.getFolderById(
    carpetasPermitidas[partes[0]]
  );

  const ficheiros = carpeta.getFilesByName(partes[1]);

  if (!ficheiros.hasNext()) {
    return {
      ok: false,
      erro: 'Non se atopou o ficheiro solicitado'
    };
  }

  const ficheiro = ficheiros.next();
  const blob = ficheiro.getBlob();

  return {
    ok: true,
    nomeFicheiro: ficheiro.getName(),
    mimeType:
      blob.getContentType() ||
      'application/octet-stream',
    base64: Utilities.base64Encode(
      blob.getBytes()
    )
  };
}

function obterUsuarioWebPorEmail(correo) {
  const usuario = buscarUsuarioWebPorEmail_(correo);
  return usuario && usuario.activo ? usuario : null;
}

function obterFollaUsuariosWeb_() {
  const propiedades =
    PropertiesService.getScriptProperties();

  const idConfigurado = String(
    propiedades.getProperty(
      'USUARIOS_WEB_SPREADSHEET_ID'
    ) || ''
  ).trim();

  if (idConfigurado) {
    const follaConfigurada = SpreadsheetApp
      .openById(idConfigurado)
      .getSheetByName('UsuariosWeb');

    if (!follaConfigurada) {
      throw new Error(
        'O arquivo configurado non contén a pestana UsuariosWeb.'
      );
    }

    return follaConfigurada;
  }

  const libroActivo =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!libroActivo) {
    throw new Error(
      'UsuariosWeb non está configurada. Executa configurarPortalSCPP().'
    );
  }

  const folla =
    libroActivo.getSheetByName('UsuariosWeb');

  if (!folla) {
    throw new Error(
      'Non se atopou a pestana UsuariosWeb. Executa configurarPortalSCPP().'
    );
  }

  propiedades.setProperty(
    'USUARIOS_WEB_SPREADSHEET_ID',
    libroActivo.getId()
  );

  return folla;
}


function buscarUsuarioWebPorEmail_(correo) {
  correo = String(correo || '')
    .trim()
    .toLowerCase();

  if (!correo) {
    return null;
  }

  const follaUsuarios =
    obterFollaUsuariosWeb_();

  const valores =
    follaUsuarios.getDataRange().getValues();

  if (valores.length < 2) {
    return null;
  }

  const cabeceiras = valores[0].map(valor =>
    String(valor).trim()
  );

  const columnaRowId =
    cabeceiras.indexOf('Row ID');
  const columnaPersoa =
    cabeceiras.indexOf('Persoa');
  const columnaEmail =
    cabeceiras.indexOf('Email');
  const columnaNome =
    cabeceiras.indexOf('Nome');
  const columnaActivo =
    cabeceiras.indexOf('Activo');
  const columnaAdministrador =
    cabeceiras.indexOf('Administrador');
  const columnaModulos =
    cabeceiras.indexOf('ModulosPermitidos');

  if (
    columnaRowId === -1 ||
    columnaPersoa === -1 ||
    columnaEmail === -1 ||
    columnaActivo === -1
  ) {
    throw new Error(
      'Faltan columnas obrigatorias en UsuariosWeb'
    );
  }

  const filaUsuario = valores.find(
    (fila, indice) =>
      indice > 0 &&
      String(fila[columnaEmail] || '')
        .trim()
        .toLowerCase() === correo
  );

  if (!filaUsuario) {
    return null;
  }

  return {
    usuarioWeb: String(
      filaUsuario[columnaRowId] || ''
    ).trim(),
    persoa: String(
      filaUsuario[columnaPersoa] || ''
    ).trim(),
    nome:
      columnaNome === -1
        ? ''
        : String(filaUsuario[columnaNome] || '').trim(),
    administrador:
      columnaAdministrador === -1
        ? false
        : (
          filaUsuario[columnaAdministrador] === true ||
          [
            'true',
            'verdadero',
            'verdadeiro',
            'si',
            'sí',
            'yes',
            'y',
            '1'
          ].includes(
            String(filaUsuario[columnaAdministrador] || '')
              .trim()
              .toLowerCase()
          )
        ),
    modulosPermitidos:
      columnaModulos === -1
        ? ''
        : String(filaUsuario[columnaModulos] || '').trim(),
    activo: valorBooleanoPortal_(
      filaUsuario[columnaActivo]
    )
  };
}


/**
 * Crea UsuariosWeb só no primeiro acceso e unicamente cando o correo
 * pertence a unha persoa activa. Activo concede os módulos ordinarios.
 * ModulosPermitidos queda baleiro e resérvase para módulos restrinxidos.
 */
function obterOuCrearUsuarioWebPorEmail_(correo) {
  correo = String(correo || '').trim().toLowerCase();

  const usuarioExistente =
    buscarUsuarioWebPorEmail_(correo);

  if (usuarioExistente) {
    return usuarioExistente.activo
      ? usuarioExistente
      : null;
  }

  const persoa = obterPersoaActivaPorEmail_(correo);
  if (!persoa) {
    return null;
  }

  const folla = obterFollaUsuariosWeb_();

  const cabeceiras = folla
    .getRange(1, 1, 1, folla.getLastColumn())
    .getDisplayValues()[0]
    .map(function(valor) {
      return String(valor || '').trim();
    });

  const agora = new Date();
  const rowId = Utilities.getUuid();
  const valores = {
    'Row ID': rowId,
    'Persoa': persoa.rowId,
    'Email': correo,
    'Nome': persoa.nome,
    'Activo': true,
    'Administrador': false,
    'ModulosPermitidos': '',
    'DataAlta': agora,
    'DataBaixa': '',
    'Observacions':
      'Alta automática desde o Portal do Coralista'
  };

  ['Row ID', 'Persoa', 'Email', 'Activo'].forEach(
    function(nome) {
      if (cabeceiras.indexOf(nome) === -1) {
        throw new Error(
          'Falta a columna ' + nome + ' en UsuariosWeb'
        );
      }
    }
  );

  folla.appendRow(cabeceiras.map(function(cabeceira) {
    return Object.prototype.hasOwnProperty.call(
      valores,
      cabeceira
    )
      ? valores[cabeceira]
      : '';
  }));

  SpreadsheetApp.flush();

  return buscarUsuarioWebPorEmail_(correo);
}


function obterPersoaActivaPorEmail_(correo) {
  correo = String(correo || '').trim().toLowerCase();
  if (!correo) return null;

  const folla = obterFollaPersoas_();
  const valores = folla.getDataRange().getValues();
  if (valores.length < 2) return null;

  const cabeceiras = valores[0].map(function(valor) {
    return normalizarCabeceiraPortal_(valor);
  });

  const columnaEmail = indiceCabeceiraPortal_(
    cabeceiras,
    ['email', 'correoelectronico', 'correo', 'mail']
  );
  const columnaActivo = indiceCabeceiraPortal_(
    cabeceiras,
    ['activo', 'activa', 'estado']
  );
  const columnaRowId = indiceCabeceiraPortal_(
    cabeceiras,
    ['rowid', 'idpersoa', 'id']
  );
  const columnaNome = indiceCabeceiraPortal_(
    cabeceiras,
    ['nome', 'nombre', 'nomecompleto', 'nombrecompleto']
  );

  if (
    columnaEmail === -1 ||
    columnaActivo === -1 ||
    columnaRowId === -1
  ) {
    throw new Error(
      'Faltan as columnas Email, Activo e Row ID en Persoas'
    );
  }

  const fila = valores.find(function(fila, indice) {
    if (indice === 0) return false;
    return String(fila[columnaEmail] || '')
      .trim()
      .toLowerCase() === correo;
  });

  if (
    !fila ||
    !valorActivoPersoaPortal_(fila[columnaActivo])
  ) {
    return null;
  }

  return {
    rowId: String(fila[columnaRowId] || '').trim(),
    nome: columnaNome === -1
      ? ''
      : String(fila[columnaNome] || '').trim()
  };
}


function obterFollaPersoas_() {
  const libroActivo =
    SpreadsheetApp.getActiveSpreadsheet();
  const follaNoLibroActivo =
    libroActivo
      ? libroActivo.getSheetByName('Persoas')
      : null;

  if (follaNoLibroActivo) {
    return follaNoLibroActivo;
  }

  const propiedades =
    PropertiesService.getScriptProperties();
  const idConfigurado = String(
    propiedades.getProperty(
      'PERSOAS_SPREADSHEET_ID'
    ) || ''
  ).trim();

  if (idConfigurado) {
    const follaConfigurada = SpreadsheetApp
      .openById(idConfigurado)
      .getSheetByName('Persoas');

    if (!follaConfigurada) {
      throw new Error(
        'O arquivo configurado non contén a pestana Persoas'
      );
    }
    return follaConfigurada;
  }

  const ficheiros = DriveApp.getFilesByName('Persoas');
  const candidatas = [];

  while (ficheiros.hasNext()) {
    const ficheiro = ficheiros.next();
    if (
      ficheiro.getMimeType() ===
      MimeType.GOOGLE_SHEETS
    ) {
      candidatas.push(ficheiro);
    }
  }

  if (candidatas.length !== 1) {
    throw new Error(
      candidatas.length === 0
        ? 'Non se atopou o arquivo Persoas. Configura PERSOAS_SPREADSHEET_ID.'
        : 'Hai varios arquivos Persoas. Configura PERSOAS_SPREADSHEET_ID.'
    );
  }

  propiedades.setProperty(
    'PERSOAS_SPREADSHEET_ID',
    candidatas[0].getId()
  );

  const folla = SpreadsheetApp
    .openById(candidatas[0].getId())
    .getSheetByName('Persoas');

  if (!folla) {
    throw new Error(
      'O arquivo localizado non contén a pestana Persoas'
    );
  }

  return folla;
}


function normalizarCabeceiraPortal_(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}


function indiceCabeceiraPortal_(
  cabeceiras,
  alternativas
) {
  for (let i = 0; i < alternativas.length; i += 1) {
    const indice = cabeceiras.indexOf(
      alternativas[i]
    );
    if (indice !== -1) return indice;
  }
  return -1;
}

function validarCabeceirasPortal_(
  folla,
  obrigatorias,
  nomeLoxico
) {
  const cabeceiras = folla
    .getRange(1, 1, 1, folla.getLastColumn())
    .getDisplayValues()[0]
    .map(function(valor) {
      return String(valor || '').trim();
    });

  const faltan = obrigatorias.filter(function(nome) {
    return cabeceiras.indexOf(nome) === -1;
  });

  if (faltan.length) {
    throw new Error(
      'Faltan columnas en ' +
      nomeLoxico +
      ': ' +
      faltan.join(', ')
    );
  }
}

function validarCabeceirasNormalizadasPortal_(
  folla,
  grupos,
  nomeLoxico
) {
  const cabeceiras = folla
    .getRange(1, 1, 1, folla.getLastColumn())
    .getDisplayValues()[0]
    .map(normalizarCabeceiraPortal_);

  const faltan = Object.keys(grupos).filter(
    function(nome) {
      return indiceCabeceiraPortal_(
        cabeceiras,
        grupos[nome]
      ) === -1;
    }
  );

  if (faltan.length) {
    throw new Error(
      'Faltan campos obrigatorios en ' +
      nomeLoxico +
      ': ' +
      faltan.join(', ')
    );
  }
}


function valorBooleanoPortal_(valor) {
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
  ].includes(
    String(valor || '').trim().toLowerCase()
  );
}


function valorActivoPersoaPortal_(valor) {
  if (valorBooleanoPortal_(valor)) return true;
  return ['activo', 'activa', 'alta'].includes(
    String(valor || '').trim().toLowerCase()
  );
}


function configurarPersoasPortal() {
  const folla = obterFollaPersoas_();
  PropertiesService.getScriptProperties().setProperty(
    'PERSOAS_SPREADSHEET_ID',
    folla.getParent().getId()
  );
  console.log(
    'Persoas configurada: ' +
    folla.getParent().getId() +
    ' | ' +
    folla.getName()
  );
}


function rexistrarAcceso(datos) {
  try {
    datos = datos || {};

    const email = String(datos.email || '')
      .trim()
      .toLowerCase();

    let persoa = String(datos.persoa || '').trim();
    let usuarioWeb = String(datos.usuarioWeb || '').trim();

    /*
     * Se a función que solicita o rexistro non enviou
     * Persoa ou UsuarioWeb, búscanse automaticamente
     * na folla UsuariosWeb a partir do correo.
     */
    if (email && (!persoa || !usuarioWeb)) {
      try {
        const usuarioIdentificado =
          buscarUsuarioWebPorEmail_(email);

        if (usuarioIdentificado) {
          if (!persoa) {
            persoa = String(
              usuarioIdentificado.persoa || ''
            ).trim();
          }

          if (!usuarioWeb) {
            usuarioWeb = String(
              usuarioIdentificado.usuarioWeb || ''
            ).trim();
          }
        }
      } catch (erroIdentidade) {
        /*
         * Se non se pode consultar UsuariosWeb,
         * o rexistro escríbese igualmente co correo.
         */
        console.warn(
          'Non foi posible completar Persoa e UsuarioWeb: ' +
          (
            erroIdentidade && erroIdentidade.message
              ? erroIdentidade.message
              : erroIdentidade
          )
        );
      }
    }

    // Arquivo independente RexistroAccesosWeb.
    const libroRexistro = SpreadsheetApp.openById(
      '1nhoP8ea1RyZiZ9SaTyFjnHG9MBOk-TMe15eHvvkXcdU'
    );

    // Identificador interno da pestana.
    const follaRexistro =
      libroRexistro.getSheetById(1291817000);

    if (!follaRexistro) {
      throw new Error(
        'Non se atopou a pestana co identificador ' +
        '1291817000'
      );
    }

    follaRexistro.appendRow([
      Utilities.getUuid(),
      persoa,
      usuarioWeb,
      email,
      new Date(),
      String(datos.tipoEvento || '').trim(),
      String(datos.modulo || '').trim(),
      String(datos.resultado || '').trim(),
      String(datos.detalle || '').trim()
    ]);

    SpreadsheetApp.flush();

    console.log(
      'Rexistro escrito correctamente na pestana: ' +
      follaRexistro.getName()
    );

  } catch (erro) {
    console.error(
      'Erro ao rexistrar o acceso: ' +
      (
        erro && erro.message
          ? erro.message
          : erro
      )
    );
  }
}


function respostaJSON(datos) {
  return ContentService
    .createTextOutput(JSON.stringify(datos))
    .setMimeType(
      ContentService.MimeType.JSON
    );
}


function autorizarAccesoUsuariosWeb() {
  const libro =
    SpreadsheetApp.getActiveSpreadsheet();

  const nomes = libro
    .getSheets()
    .map(folla => folla.getName());

  console.log(
    'Pestanas atopadas: ' + nomes.join(' | ')
  );
}


function comprobarRexistroAccesosWeb() {
  const libroRexistro = SpreadsheetApp.openById(
    '1nhoP8ea1RyZiZ9SaTyFjnHG9MBOk-TMe15eHvvkXcdU'
  );

  const follaRexistro =
    libroRexistro.getSheetById(1291817000);

  if (!follaRexistro) {
    throw new Error(
      'Non se atopou a pestana co identificador ' +
      '1291817000'
    );
  }

  console.log(
    'Acceso correcto á pestana: ' +
    follaRexistro.getName()
  );
}


function probarEscrituraRexistro() {
  rexistrarAcceso({
    persoa: '',
    usuarioWeb: '',
    email: 'PROBA',
    tipoEvento: 'Proba manual',
    modulo: 'UsuariosWeb',
    resultado: 'Correcto',
    detalle:
      'Proba directa desde Apps Script'
  });
}
function comprobarFollaAceptacion() {
  const libroAceptacion = SpreadsheetApp.openById(
    '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k'
  );

  const follaAceptacion =
    libroAceptacion.getSheetById(974695665);

  if (!follaAceptacion) {
    throw new Error(
      'Non se atopou a pestana co identificador 974695665'
    );
  }

  const cabeceiras = follaAceptacion
    .getRange(
      1,
      1,
      1,
      follaAceptacion.getLastColumn()
    )
    .getValues()[0];

  console.log(
    'Pestana correcta: ' +
    follaAceptacion.getName()
  );

  console.log(
    'Cabeceiras: ' +
    cabeceiras.join(' | ')
  );
}


function rexistrarAceptacion(datos) {
  const libroAceptacion = SpreadsheetApp.openById(
    '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k'
  );

  const follaAceptacion =
    libroAceptacion.getSheetById(974695665);

  if (!follaAceptacion) {
    throw new Error(
      'Non se atopou a pestana Aceptación'
    );
  }

  follaAceptacion.appendRow([
    Utilities.getUuid(),
    datos.email || '',
    new Date(),
    datos.version || '',
    datos.textoLegal || '',
    datos.aceptaFines === true,
    datos.persoa || '',
    datos.usuarioWeb || '',
    datos.ambito || '',
    datos.canle || '',
    datos.dataRetirada || ''
  ]);

  SpreadsheetApp.flush();

  console.log(
    'Aceptación escrita correctamente'
  );
}


function tenAceptacionVixente_(correo, version) {
  const libroAceptacion = SpreadsheetApp.openById(
    '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k'
  );

  const follaAceptacion =
    libroAceptacion.getSheetById(974695665);

  if (!follaAceptacion) {
    throw new Error(
      'Non se atopou a pestana Aceptación'
    );
  }

  const valores =
    follaAceptacion.getDataRange().getValues();
  if (valores.length < 2) return false;

  const cabeceiras = valores[0].map(function(valor) {
    return normalizarCabeceiraPortal_(valor);
  });

  const columnaEmail = indiceCabeceiraPortal_(
    cabeceiras,
    ['correoelectronico', 'email', 'correo']
  );
  const columnaVersion = indiceCabeceiraPortal_(
    cabeceiras,
    ['version']
  );
  const columnaAcepta = indiceCabeceiraPortal_(
    cabeceiras,
    ['aceptafines', 'acepta']
  );
  const columnaRetirada = indiceCabeceiraPortal_(
    cabeceiras,
    ['dataretirada', 'fecharetirada']
  );

  if (
    columnaEmail === -1 ||
    columnaVersion === -1 ||
    columnaAcepta === -1
  ) {
    throw new Error(
      'Faltan columnas obrigatorias na folla Aceptación'
    );
  }

  for (let i = valores.length - 1; i > 0; i -= 1) {
    const fila = valores[i];
    const mesmoCorreo =
      String(fila[columnaEmail] || '')
        .trim()
        .toLowerCase() === correo;
    const mesmaVersion =
      String(fila[columnaVersion] || '').trim() ===
      version;
    const aceptada =
      valorBooleanoPortal_(fila[columnaAcepta]);
    const retirada =
      columnaRetirada !== -1 &&
      String(fila[columnaRetirada] || '').trim() !== '';

    if (
      mesmoCorreo &&
      mesmaVersion &&
      aceptada &&
      !retirada
    ) {
      return true;
    }
  }

  return false;
}


function probarEscrituraAceptacion() {
  console.log(
    'A función probarEscrituraAceptacion foi recoñecida correctamente'
  );
}
function probarPostAceptacion() {
  const propiedades =
    PropertiesService.getScriptProperties();

  const token =
    propiedades.getProperty('WEB_WRITE_TOKEN');

  const correo = String(
    propiedades.getProperty('WEB_TEST_EMAIL') || ''
  )
    .trim()
    .toLowerCase();

  const eventoSimulado = {
    postData: {
      contents: JSON.stringify({
        token: token,
        accion: 'rexistrarAceptacion',
        email: correo,
        version: 'PRIVACIDADE-WEB-1.0',
        textoLegal:
          'Texto de proba da aceptación da política de privacidade.',
        aceptaFines: true,
        persoa: '',
        usuarioWeb: '',
        ambito:
          'coralpolifonicapontevedra.org'
      })
    }
  };

  const resposta = doPost(eventoSimulado);

  console.log(
    resposta.getContent()
  );
}

/**
 * Texto legal vixente do portal privado.
 *
 * Este módulo evita que o navegador decida a versión ou o contido aceptado.
 * Tanto a comprobación como o rexistro resolven a fila activa directamente
 * desde TextosLegais.
 */
const ACEPTACION_SPREADSHEET_ID_ =
  '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k';
const TEXTOS_LEGAIS_SHEET_ID_ = 2025412208;
const TEXTO_LEGAL_PORTAL_ID_ = 'PRIVACIDADE_WEB';

function obterTextoLegalVixente_() {
  const libro = SpreadsheetApp.openById(
    ACEPTACION_SPREADSHEET_ID_
  );
  const folla = libro.getSheetById(TEXTOS_LEGAIS_SHEET_ID_);

  if (!folla || folla.getName() !== 'TextosLegais') {
    throw new Error('Non se atopou a pestana TextosLegais configurada');
  }

  const valores = folla.getDataRange().getValues();
  if (valores.length < 2) {
    throw new Error('TextosLegais non contén ningún texto legal');
  }

  const cabeceiras = valores[0].map(function(valor) {
    return normalizarCabeceiraPortal_(valor);
  });
  const columnas = {
    id: indiceCabeceiraPortal_(cabeceiras, ['id']),
    version: indiceCabeceiraPortal_(cabeceiras, ['version']),
    titulo: indiceCabeceiraPortal_(cabeceiras, ['titulo']),
    texto: indiceCabeceiraPortal_(cabeceiras, ['texto']),
    dataVixencia: indiceCabeceiraPortal_(
      cabeceiras,
      ['datavixencia', 'fechavigencia']
    ),
    activo: indiceCabeceiraPortal_(cabeceiras, ['activo']),
    ambito: indiceCabeceiraPortal_(cabeceiras, ['ambito']),
    idTextoLegal: indiceCabeceiraPortal_(
      cabeceiras,
      ['idtextolegal']
    )
  };

  Object.keys(columnas).forEach(function(nome) {
    if (columnas[nome] === -1) {
      throw new Error(
        'Falta a columna obrigatoria ' + nome + ' en TextosLegais'
      );
    }
  });

  const agora = new Date();
  const candidatas = valores
    .slice(1)
    .map(function(fila, indice) {
      const data = normalizarDataTextoLegal_(
        fila[columnas.dataVixencia]
      );
      return { fila: fila, indice: indice, data: data };
    })
    .filter(function(candidata) {
      const fila = candidata.fila;
      return (
        String(fila[columnas.id] || '').trim() ===
          TEXTO_LEGAL_PORTAL_ID_ &&
        valorBooleanoPortal_(fila[columnas.activo]) &&
        candidata.data &&
        candidata.data.getTime() <= agora.getTime()
      );
    })
    .sort(function(a, b) {
      return (
        b.data.getTime() - a.data.getTime() ||
        b.indice - a.indice
      );
    });

  if (!candidatas.length) {
    throw new Error(
      'Non hai un texto legal activo e vixente para o portal privado'
    );
  }

  const fila = candidatas[0].fila;
  const resultado = {
    id: String(fila[columnas.id] || '').trim(),
    idTextoLegal: String(
      fila[columnas.idTextoLegal] || ''
    ).trim(),
    version: String(fila[columnas.version] || '').trim(),
    titulo: String(fila[columnas.titulo] || '').trim(),
    texto: String(fila[columnas.texto] || '').trim(),
    ambito: String(fila[columnas.ambito] || '').trim(),
    dataVixencia: Utilities.formatDate(
      candidatas[0].data,
      'Europe/Madrid',
      'yyyy-MM-dd'
    )
  };

  if (!resultado.version || !resultado.titulo || !resultado.texto) {
    throw new Error('O texto legal vixente está incompleto');
  }
  return resultado;
}

function normalizarDataTextoLegal_(valor) {
  if (
    Object.prototype.toString.call(valor) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return valor;
  }

  const texto = String(valor || '').trim();
  const partes = texto.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!partes) return null;

  const data = new Date(
    Number(partes[3]),
    Number(partes[2]) - 1,
    Number(partes[1])
  );
  return isNaN(data.getTime()) ? null : data;
}

function comprobarAceptacionPortal_(correo) {
  const textoLegal = obterTextoLegalVixente_();
  return {
    ok: true,
    aceptacionVixente: tenAceptacionVixente_(
      correo,
      textoLegal.version
    ),
    textoLegal: textoLegal
  };
}

function rexistrarAceptacionPortal_(correo) {
  const usuario = obterOuCrearUsuarioWebPorEmail_(correo);
  if (!usuario) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  const textoLegal = obterTextoLegalVixente_();
  rexistrarAceptacion({
    email: correo,
    version: textoLegal.version,
    textoLegal: textoLegal.texto,
    aceptaFines: true,
    persoa: usuario.persoa,
    usuarioWeb: usuario.usuarioWeb,
    ambito: textoLegal.ambito,
    canle: 'Web',
    dataRetirada: ''
  });

  return {
    ok: true,
    mensaxe: 'Aceptación rexistrada correctamente',
    version: textoLegal.version,
    textoLegalId: textoLegal.idTextoLegal,
    usuario: usuario
  };
}

function probarTextoLegalVixente() {
  console.log(JSON.stringify(obterTextoLegalVixente_()));
}
