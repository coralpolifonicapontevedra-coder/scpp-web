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

  console.log('Configuraci√≥n creada correctamente.');
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
 * unha nova versi√≥n do Web App.
 *
 * - Garda de forma expl√≠cita o libro de UsuariosWeb.
 * - Localiza e garda o libro de Persoas.
 * - Comproba as cabeceiras necesarias para o primeiro acceso.
 *
 * A procura en Drive s√≥ se usa nesta configuraci√≥n inicial. As petici√≥ns
 * posteriores do Portal abren ambos os libros directamente polos seus IDs.
 */
function configurarPortalSCPP() {
  const propiedades =
    PropertiesService.getScriptProperties();

  const libroUsuarios =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!libroUsuarios) {
    throw new Error(
      'Este proxecto debe estar vinculado ao arquivo que cont√©n UsuariosWeb.'
    );
  }

  const follaUsuarios =
    libroUsuarios.getSheetByName('UsuariosWeb');

  if (!follaUsuarios) {
    throw new Error(
      'O arquivo activo non cont√©n a pestana UsuariosWeb.'
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
          tipoEvento: 'Aceptar protecci√≥n de datos',
          modulo: 'Aceptacion',
          resultado: 'Rexeitado',
          detalle: 'Non se confirmou a aceptaci√≥n'
        });

        return respostaJSON({
          ok: false,
          erro: '√â necesario confirmar a aceptaci√≥n'
        });
      }

      bloqueo.waitLock(10000);

      const resultadoAceptacion =
        rexistrarAceptacionPortal_(correo);

      if (!resultadoAceptacion.ok) {
        rexistrarAcceso({
          email: correo,
          tipoEvento: 'Aceptar protecci√≥n de datos',
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
          tipoEvento: 'Aceptar protecci√≥n de datos',
        modulo: 'Aceptacion',
        resultado: 'Correcto',
        detalle:
          'Aceptaci√≥n ' +
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
          : String(resultadoPerfil.erro || 'Erro desco√±ecido')
      });

      return respostaJSON(resultadoPerfil);
    }

    if (accion === 'actualizarPerfil') {
      bloqueo.waitLock(10000);

      const resultadoPerfil = actualizarPerfilPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Actualizaci√≥n do perfil',
        modulo: 'Perfil',
        resultado: resultadoPerfil.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultadoPerfil.ok
          ? 'Datos persoais actualizados'
          : String(resultadoPerfil.erro || 'Erro desco√±ecido')
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
          : String(resultadoDocumento.erro || 'Erro desco√±ecido')
      });

      return respostaJSON(resultadoDocumento);
    }

    if (accion === 'subirFoto') {
      bloqueo.waitLock(10000);

      const resultadoFoto = subirFotoPortal_(datos);

      rexistrarAcceso({
        email: correo,
        tipoEvento: 'Achegar fotograf√≠a',
        modulo: 'Fotos',
        resultado: resultadoFoto.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultadoFoto.ok
          ? 'Fotograf√≠a enviada para revisi√≥n'
          : String(resultadoFoto.erro || 'Erro desco√±ecido')
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
        tipoEvento: 'Revisar fotograf√≠a',
        modulo: 'Fotos',
        resultado: resultadoRevision.ok ? 'Correcto' : 'Rexeitado',
        detalle: resultadoRevision.ok
          ? String(resultadoRevision.estado || '')
          : String(resultadoRevision.erro || 'Erro desco√±ecido')
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
    tipoEvento: 'Eliminar fotograf√≠a',
    modulo: 'Fotos',
    resultado: resultado.ok ? 'Correcto' : 'Rexeitado',
    detalle: resultado.ok
      ? 'Fotograf√≠a eliminada desde o Portal'
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
        listarDocumentacionPÔæª∂âûÀk∫wµÁE…≈’•ŸºÅAï…ÕΩÖÃ∏ÅΩπô•ù’…ÑÅAIM=M}MAIM!Q}%∏ú(ÄÄÄÄÄÄÄÄËÄù!Ö§ÅŸÖ…•ΩÃÅÖ…≈’•ŸΩÃÅAï…ÕΩÖÃ∏ÅΩπô•ù’…ÑÅAIM=M}MAIM!Q}%∏ú(ÄÄÄÄ§Ï(ÄÅÙ((ÄÅ¡…Ω¡•ïëÖëïÃπÕï—A…Ω¡ï…—‰†(ÄÄÄÄùAIM=M}MAIM!Q}%ú∞(ÄÄÄÅçÖπë•ëÖ—ÖÕl¡tπùï—%ê†§(ÄÄ§Ï((ÄÅçΩπÕ–ÅôΩ±±ÑÄÙÅM¡…ïÖëÕ°ïï—¡¿(ÄÄÄÄπΩ¡ïπ	Â%ê°çÖπë•ëÖ—ÖÕl¡tπùï—%ê†§§(ÄÄÄÄπùï—M°ïï—	Â9Öµî†ùAï…ÕΩÖÃú§Ï((ÄÅ•òÄ†ÖôΩ±±Ñ§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄù<ÅÖ…≈’•ŸºÅ±ΩçÖ±•ÈÖëºÅπΩ∏ÅçΩπ”•∏ÅÑÅ¡ïÕ—ÖπÑÅAï…ÕΩÖÃú(ÄÄÄÄ§Ï(ÄÅÙ((ÄÅ…ï—’…∏ÅôΩ±±ÑÏ)Ù(()ô’πç—•Ω∏ÅπΩ…µÖ±•ÈÖ…Öâïçï•…ÖAΩ…—Ö±|°ŸÖ±Ω»§ÅÏ(ÄÅ…ï—’…∏ÅM—…•πú°ŸÖ±Ω»ÅÒÄúú§(ÄÄÄÄππΩ…µÖ±•Èî†ù9ú§(ÄÄÄÄπ…ï¡±Öçî†Ωmq‘¿Ã¿¿µq‘¿ÃŸôtΩú∞Äúú§(ÄÄÄÄπ—Ω1Ω›ï…ÖÕî†§(ÄÄÄÄπ…ï¡±Öçî†ΩmyÑµË¿¥ÂtΩú∞Äúú§Ï)Ù(()ô’πç—•Ω∏Å•πë•çïÖâïçï•…ÖAΩ…—Ö±|†(ÄÅçÖâïçï•…ÖÃ∞(ÄÅÖ±—ï…πÖ—•ŸÖÃ(§ÅÏ(ÄÅôΩ»Ä°±ï–Å§ÄÙÄ¿ÏÅ§ÄÅÖ±—ï…πÖ—•ŸÖÃπ±ïπù—†ÏÅ§Ä¨ÙÄƒ§ÅÏ(ÄÄÄÅçΩπÕ–Å•πë•çîÄÙÅçÖâïçï•…ÖÃπ•πëï·=ò†(ÄÄÄÄÄÅÖ±—ï…πÖ—•ŸÖÕm•t(ÄÄÄÄ§Ï(ÄÄÄÅ•òÄ°•πë•çîÄÑÙÙÄ¥ƒ§Å…ï—’…∏Å•πë•çîÏ(ÄÅÙ(ÄÅ…ï—’…∏Ä¥ƒÏ)Ù()ô’πç—•Ω∏ÅŸÖ±•ëÖ…Öâïçï•…ÖÕAΩ…—Ö±|†(ÄÅôΩ±±Ñ∞(ÄÅΩâ…•ùÖ—Ω…•ÖÃ∞(ÄÅπΩµï1Ω·•çº(§ÅÏ(ÄÅçΩπÕ–ÅçÖâïçï•…ÖÃÄÙÅôΩ±±Ñ(ÄÄÄÄπùï—IÖπùî†ƒ∞Äƒ∞Äƒ∞ÅôΩ±±Ñπùï—1ÖÕ—Ω±’µ∏†§§(ÄÄÄÄπùï—•Õ¡±ÖÂYÖ±’ïÃ†•l¡t(ÄÄÄÄπµÖ¿°ô’πç—•Ω∏°ŸÖ±Ω»§ÅÏ(ÄÄÄÄÄÅ…ï—’…∏ÅM—…•πú°ŸÖ±Ω»ÅÒÄúú§π—…•¥†§Ï(ÄÄÄÅÙ§Ï((ÄÅçΩπÕ–ÅôÖ±—Ö∏ÄÙÅΩâ…•ùÖ—Ω…•ÖÃπô•±—ï»°ô’πç—•Ω∏°πΩµî§ÅÏ(ÄÄÄÅ…ï—’…∏ÅçÖâïçï•…ÖÃπ•πëï·=ò°πΩµî§ÄÙÙÙÄ¥ƒÏ(ÄÅÙ§Ï((ÄÅ•òÄ°ôÖ±—Ö∏π±ïπù—†§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄùÖ±—Ö∏ÅçΩ±’µπÖÃÅï∏ÄúÄ¨(ÄÄÄÄÄÅπΩµï1Ω·•çºÄ¨(ÄÄÄÄÄÄúËÄúÄ¨(ÄÄÄÄÄÅôÖ±—Ö∏π©Ω•∏†ú∞Äú§(ÄÄÄÄ§Ï(ÄÅÙ)Ù()ô’πç—•Ω∏ÅŸÖ±•ëÖ…Öâïçï•…ÖÕ9Ω…µÖ±•ÈÖëÖÕAΩ…—Ö±|†(ÄÅôΩ±±Ñ∞(ÄÅù…’¡ΩÃ∞(ÄÅπΩµï1Ω·•çº(§ÅÏ(ÄÅçΩπÕ–ÅçÖâïçï•…ÖÃÄÙÅôΩ±±Ñ(ÄÄÄÄπùï—IÖπùî†ƒ∞Äƒ∞Äƒ∞ÅôΩ±±Ñπùï—1ÖÕ—Ω±’µ∏†§§(ÄÄÄÄπùï—•Õ¡±ÖÂYÖ±’ïÃ†•l¡t(ÄÄÄÄπµÖ¿°πΩ…µÖ±•ÈÖ…Öâïçï•…ÖAΩ…—Ö±|§Ï((ÄÅçΩπÕ–ÅôÖ±—Ö∏ÄÙÅ=â©ïç–π≠ïÂÃ°ù…’¡ΩÃ§πô•±—ï»†(ÄÄÄÅô’πç—•Ω∏°πΩµî§ÅÏ(ÄÄÄÄÄÅ…ï—’…∏Å•πë•çïÖâïçï•…ÖAΩ…—Ö±|†(ÄÄÄÄÄÄÄÅçÖâïçï•…ÖÃ∞(ÄÄÄÄÄÄÄÅù…’¡ΩÕmπΩµït(ÄÄÄÄÄÄ§ÄÙÙÙÄ¥ƒÏ(ÄÄÄÅÙ(ÄÄ§Ï((ÄÅ•òÄ°ôÖ±—Ö∏π±ïπù—†§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄùÖ±—Ö∏ÅçÖµ¡ΩÃÅΩâ…•ùÖ—Ω…•ΩÃÅï∏ÄúÄ¨(ÄÄÄÄÄÅπΩµï1Ω·•çºÄ¨(ÄÄÄÄÄÄúËÄúÄ¨(ÄÄÄÄÄÅôÖ±—Ö∏π©Ω•∏†ú∞Äú§(ÄÄÄÄ§Ï(ÄÅÙ)Ù(()ô’πç—•Ω∏ÅŸÖ±Ω…	ΩΩ±ïÖπΩAΩ…—Ö±|°ŸÖ±Ω»§ÅÏ(ÄÅ•òÄ°ŸÖ±Ω»ÄÙÙÙÅ—…’î§Å…ï—’…∏Å—…’îÏ(ÄÅ…ï—’…∏Ål(ÄÄÄÄù—…’îú∞(ÄÄÄÄùŸï…ëÖëï…ºú∞(ÄÄÄÄùŸï…ëÖëï•…ºú∞(ÄÄÄÄùÕ§ú∞(ÄÄÄÄùœ¥ú∞(ÄÄÄÄùÂïÃú∞(ÄÄÄÄù‰ú∞(ÄÄÄÄúƒú(ÄÅtπ•πç±’ëïÃ†(ÄÄÄÅM—…•πú°ŸÖ±Ω»ÅÒÄúú§π—…•¥†§π—Ω1Ω›ï…ÖÕî†§(ÄÄ§Ï)Ù(()ô’πç—•Ω∏ÅŸÖ±Ω…ç—•ŸΩAï…ÕΩÖAΩ…—Ö±|°ŸÖ±Ω»§ÅÏ(ÄÅ•òÄ°ŸÖ±Ω…	ΩΩ±ïÖπΩAΩ…—Ö±|°ŸÖ±Ω»§§Å…ï—’…∏Å—…’îÏ(ÄÅ…ï—’…∏ÅlùÖç—•Ÿºú∞ÄùÖç—•ŸÑú∞ÄùÖ±—Ñùtπ•πç±’ëïÃ†(ÄÄÄÅM—…•πú°ŸÖ±Ω»ÅÒÄúú§π—…•¥†§π—Ω1Ω›ï…ÖÕî†§(ÄÄ§Ï)Ù(()ô’πç—•Ω∏ÅçΩπô•ù’…Ö…Aï…ÕΩÖÕAΩ…—Ö∞†§ÅÏ(ÄÅçΩπÕ–ÅôΩ±±ÑÄÙÅΩâ—ï…Ω±±ÖAï…ÕΩÖÕ|†§Ï(ÄÅA…Ω¡ï…—•ïÕMï…Ÿ•çîπùï—Mç…•¡—A…Ω¡ï…—•ïÃ†§πÕï—A…Ω¡ï…—‰†(ÄÄÄÄùAIM=M}MAIM!Q}%ú∞(ÄÄÄÅôΩ±±Ñπùï—AÖ…ïπ–†§πùï—%ê†§(ÄÄ§Ï(ÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÄùAï…ÕΩÖÃÅçΩπô•ù’…ÖëÑËÄúÄ¨(ÄÄÄÅôΩ±±Ñπùï—AÖ…ïπ–†§πùï—%ê†§Ä¨(ÄÄÄÄúÅÄúÄ¨(ÄÄÄÅôΩ±±Ñπùï—9Öµî†§(ÄÄ§Ï)Ù(()ô’πç—•Ω∏Å…ï·•Õ—…Ö…ççïÕº°ëÖ—ΩÃ§ÅÏ(ÄÅ—…‰ÅÏ(ÄÄÄÅëÖ—ΩÃÄÙÅëÖ—ΩÃÅÒÅÌÙÏ((ÄÄÄÅçΩπÕ–ÅïµÖ•∞ÄÙÅM—…•πú°ëÖ—ΩÃπïµÖ•∞ÅÒÄúú§(ÄÄÄÄÄÄπ—…•¥†§(ÄÄÄÄÄÄπ—Ω1Ω›ï…ÖÕî†§Ï((ÄÄÄÅ±ï–Å¡ï…ÕΩÑÄÙÅM—…•πú°ëÖ—ΩÃπ¡ï…ÕΩÑÅÒÄúú§π—…•¥†§Ï(ÄÄÄÅ±ï–Å’Õ’Ö…•Ω]ïàÄÙÅM—…•πú°ëÖ—ΩÃπ’Õ’Ö…•Ω]ïàÅÒÄúú§π—…•¥†§Ï((ÄÄÄÄº®(ÄÄÄÄÄ®ÅMîÅÑÅô’πçßÕ∏Å≈’îÅÕΩ±•ç•—ÑÅºÅ…ï·•Õ—…ºÅπΩ∏ÅïπŸ•Ω‘(ÄÄÄÄÄ®ÅAï…ÕΩÑÅΩ‘ÅUÕ’Ö…•Ω]ïà∞ÅãÈÕçÖπÕîÅÖ’—ΩµÖ—•çÖµïπ—î(ÄÄÄÄÄ®ÅπÑÅôΩ±±ÑÅUÕ’Ö…•ΩÕ]ïàÅÑÅ¡Ö…—•»ÅëºÅçΩ……ïº∏(ÄÄÄÄÄ®º(ÄÄÄÅ•òÄ°ïµÖ•∞ÄòòÄ†Ö¡ï…ÕΩÑÅÒÄÖ’Õ’Ö…•Ω]ïà§§ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å’Õ’Ö…•Ω%ëïπ—•ô•çÖëºÄÙ(ÄÄÄÄÄÄÄÄÄÅâ’ÕçÖ…UÕ’Ö…•Ω]ïâAΩ…µÖ•±|°ïµÖ•∞§Ï((ÄÄÄÄÄÄÄÅ•òÄ°’Õ’Ö…•Ω%ëïπ—•ô•çÖëº§ÅÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö¡ï…ÕΩÑ§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ¡ï…ÕΩÑÄÙÅM—…•πú†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ’Õ’Ö…•Ω%ëïπ—•ô•çÖëºπ¡ï…ÕΩÑÅÒÄúú(ÄÄÄÄÄÄÄÄÄÄÄÄ§π—…•¥†§Ï(ÄÄÄÄÄÄÄÄÄÅÙ((ÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö’Õ’Ö…•Ω]ïà§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ’Õ’Ö…•Ω]ïàÄÙÅM—…•πú†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ’Õ’Ö…•Ω%ëïπ—•ô•çÖëºπ’Õ’Ö…•Ω]ïàÅÒÄúú(ÄÄÄÄÄÄÄÄÄÄÄÄ§π—…•¥†§Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°ï……Ω%ëïπ—•ëÖëî§ÅÏ(ÄÄÄÄÄÄÄÄº®(ÄÄÄÄÄÄÄÄÄ®ÅMîÅπΩ∏ÅÕîÅ¡ΩëîÅçΩπÕ’±—Ö»ÅUÕ’Ö…•ΩÕ]ïà∞(ÄÄÄÄÄÄÄÄÄ®ÅºÅ…ï·•Õ—…ºÅïÕçÀµâïÕîÅ•ù’Ö±µïπ—îÅçºÅçΩ……ïº∏(ÄÄÄÄÄÄÄÄÄ®º(ÄÄÄÄÄÄÄÅçΩπÕΩ±îπ›Ö…∏†(ÄÄÄÄÄÄÄÄÄÄù9Ω∏ÅôΩ§Å¡ΩÕ•â±îÅçΩµ¡±ï—Ö»ÅAï…ÕΩÑÅîÅUÕ’Ö…•Ω]ïàËÄúÄ¨(ÄÄÄÄÄÄÄÄÄÄ†(ÄÄÄÄÄÄÄÄÄÄÄÅï……Ω%ëïπ—•ëÖëîÄòòÅï……Ω%ëïπ—•ëÖëîπµïÕÕÖùî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ¸Åï……Ω%ëïπ—•ëÖëîπµïÕÕÖùî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄËÅï……Ω%ëïπ—•ëÖëî(ÄÄÄÄÄÄÄÄÄÄ§(ÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙ((ÄÄÄÄººÅ…≈’•ŸºÅ•πëï¡ïπëïπ—îÅIï·•Õ—…ΩççïÕΩÕ]ïà∏(ÄÄÄÅçΩπÕ–Å±•â…ΩIï·•Õ—…ºÄÙÅM¡…ïÖëÕ°ïï—¡¿πΩ¡ïπ	Â%ê†(ÄÄÄÄÄÄú≈π°Ω@·ïÑ≈IÂi•hÂMÖQÂ©π!Â5	=¨µQ5îƒ’ï!ŸŸ≠açëTú(ÄÄÄÄ§Ï((ÄÄÄÄººÅ%ëïπ—•ô•çÖëΩ»Å•π—ï…πºÅëÑÅ¡ïÕ—ÖπÑ∏(ÄÄÄÅçΩπÕ–ÅôΩ±±ÖIï·•Õ—…ºÄÙ(ÄÄÄÄÄÅ±•â…ΩIï·•Õ—…ºπùï—M°ïï—	Â%ê†ƒ»‰ƒ‡ƒ‹¿¿¿§Ï((ÄÄÄÅ•òÄ†ÖôΩ±±ÖIï·•Õ—…º§ÅÏ(ÄÄÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄÄÄù9Ω∏ÅÕîÅÖ—Ω¡Ω‘ÅÑÅ¡ïÕ—ÖπÑÅçºÅ•ëïπ—•ô•çÖëΩ»ÄúÄ¨(ÄÄÄÄÄÄÄÄúƒ»‰ƒ‡ƒ‹¿¿¿ú(ÄÄÄÄÄÄ§Ï(ÄÄÄÅÙ((ÄÄÄÅôΩ±±ÖIï·•Õ—…ºπÖ¡¡ïπëIΩ‹°l(ÄÄÄÄÄÅU—•±•—•ïÃπùï—U’•ê†§∞(ÄÄÄÄÄÅ¡ï…ÕΩÑ∞(ÄÄÄÄÄÅ’Õ’Ö…•Ω]ïà∞(ÄÄÄÄÄÅïµÖ•∞∞(ÄÄÄÄÄÅπï‹ÅÖ—î†§∞(ÄÄÄÄÄÅM—…•πú°ëÖ—ΩÃπ—•¡ΩŸïπ—ºÅÒÄúú§π—…•¥†§∞(ÄÄÄÄÄÅM—…•πú°ëÖ—ΩÃπµΩë’±ºÅÒÄúú§π—…•¥†§∞(ÄÄÄÄÄÅM—…•πú°ëÖ—ΩÃπ…ïÕ’±—ÖëºÅÒÄúú§π—…•¥†§∞(ÄÄÄÄÄÅM—…•πú°ëÖ—ΩÃπëï—Ö±±îÅÒÄúú§π—…•¥†§(ÄÄÄÅt§Ï((ÄÄÄÅM¡…ïÖëÕ°ïï—¡¿πô±’Õ††§Ï((ÄÄÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÄÄÄùIï·•Õ—…ºÅïÕç…•—ºÅçΩ……ïç—Öµïπ—îÅπÑÅ¡ïÕ—ÖπÑËÄúÄ¨(ÄÄÄÄÄÅôΩ±±ÖIï·•Õ—…ºπùï—9Öµî†§(ÄÄÄÄ§Ï((ÄÅÙÅçÖ—ç†Ä°ï……º§ÅÏ(ÄÄÄÅçΩπÕΩ±îπï……Ω»†(ÄÄÄÄÄÄù……ºÅÖºÅ…ï·•Õ—…Ö»ÅºÅÖççïÕºËÄúÄ¨(ÄÄÄÄÄÄ†(ÄÄÄÄÄÄÄÅï……ºÄòòÅï……ºπµïÕÕÖùî(ÄÄÄÄÄÄÄÄÄÄ¸Åï……ºπµïÕÕÖùî(ÄÄÄÄÄÄÄÄÄÄËÅï……º(ÄÄÄÄÄÄ§(ÄÄÄÄ§Ï(ÄÅÙ)Ù(()ô’πç—•Ω∏Å…ïÕ¡ΩÕ—Ö)M=8°ëÖ—ΩÃ§ÅÏ(ÄÅ…ï—’…∏ÅΩπ—ïπ—Mï…Ÿ•çî(ÄÄÄÄπç…ïÖ—ïQï·—=’—¡’–°)M=8πÕ—…•πù•ô‰°ëÖ—ΩÃ§§(ÄÄÄÄπÕï—5•µïQÂ¡î†(ÄÄÄÄÄÅΩπ—ïπ—Mï…Ÿ•çîπ5•µïQÂ¡îπ)M=8(ÄÄÄÄ§Ï)Ù(()ô’πç—•Ω∏ÅÖ’—Ω…•ÈÖ…ççïÕΩUÕ’Ö…•ΩÕ]ïà†§ÅÏ(ÄÅçΩπÕ–Å±•â…ºÄÙ(ÄÄÄÅM¡…ïÖëÕ°ïï—¡¿πùï—ç—•ŸïM¡…ïÖëÕ°ïï–†§Ï((ÄÅçΩπÕ–ÅπΩµïÃÄÙÅ±•â…º(ÄÄÄÄπùï—M°ïï—Ã†§(ÄÄÄÄπµÖ¿°ôΩ±±ÑÄÙ¯ÅôΩ±±Ñπùï—9Öµî†§§Ï((ÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÄùAïÕ—ÖπÖÃÅÖ—Ω¡ÖëÖÃËÄúÄ¨ÅπΩµïÃπ©Ω•∏†úÅÄú§(ÄÄ§Ï)Ù(()ô’πç—•Ω∏ÅçΩµ¡…ΩâÖ…Iï·•Õ—…ΩççïÕΩÕ]ïà†§ÅÏ(ÄÅçΩπÕ–Å±•â…ΩIï·•Õ—…ºÄÙÅM¡…ïÖëÕ°ïï—¡¿πΩ¡ïπ	Â%ê†(ÄÄÄÄú≈π°Ω@·ïÑ≈IÂi•hÂMÖQÂ©π!Â5	=¨µQ5îƒ’ï!ŸŸ≠açëTú(ÄÄ§Ï((ÄÅçΩπÕ–ÅôΩ±±ÖIï·•Õ—…ºÄÙ(ÄÄÄÅ±•â…ΩIï·•Õ—…ºπùï—M°ïï—	Â%ê†ƒ»‰ƒ‡ƒ‹¿¿¿§Ï((ÄÅ•òÄ†ÖôΩ±±ÖIï·•Õ—…º§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄù9Ω∏ÅÕîÅÖ—Ω¡Ω‘ÅÑÅ¡ïÕ—ÖπÑÅçºÅ•ëïπ—•ô•çÖëΩ»ÄúÄ¨(ÄÄÄÄÄÄúƒ»‰ƒ‡ƒ‹¿¿¿ú(ÄÄÄÄ§Ï(ÄÅÙ((ÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÄùççïÕºÅçΩ……ïç—ºÉÑÅ¡ïÕ—ÖπÑËÄúÄ¨(ÄÄÄÅôΩ±±ÖIï·•Õ—…ºπùï—9Öµî†§(ÄÄ§Ï)Ù(()ô’πç—•Ω∏Å¡…ΩâÖ…Õç…•—’…ÖIï·•Õ—…º†§ÅÏ(ÄÅ…ï·•Õ—…Ö…ççïÕº°Ï(ÄÄÄÅ¡ï…ÕΩÑËÄúú∞(ÄÄÄÅ’Õ’Ö…•Ω]ïàËÄúú∞(ÄÄÄÅïµÖ•∞ËÄùAI=	ú∞(ÄÄÄÅ—•¡ΩŸïπ—ºËÄùA…ΩâÑÅµÖπ’Ö∞ú∞(ÄÄÄÅµΩë’±ºËÄùUÕ’Ö…•ΩÕ]ïàú∞(ÄÄÄÅ…ïÕ’±—ÖëºËÄùΩ……ïç—ºú∞(ÄÄÄÅëï—Ö±±îË(ÄÄÄÄÄÄùA…ΩâÑÅë•…ïç—ÑÅëïÕëîÅ¡¡ÃÅMç…•¡–ú(ÄÅÙ§Ï)Ù)ô’πç—•Ω∏ÅçΩµ¡…ΩâÖ…Ω±±Öçï¡—Öç•Ω∏†§ÅÏ(ÄÅçΩπÕ–Å±•â…Ωçï¡—Öç•Ω∏ÄÙÅM¡…ïÖëÕ°ïï—¡¿πΩ¡ïπ	Â%ê†(ÄÄÄÄú≈ùπëED≈E1—ú…±UT·9Ñ’≠ÕTÕTŸ›i9·)$…eîŸË›5‘›¨ú(ÄÄ§Ï((ÄÅçΩπÕ–ÅôΩ±±Öçï¡—Öç•Ω∏ÄÙ(ÄÄÄÅ±•â…Ωçï¡—Öç•Ω∏πùï—M°ïï—	Â%ê†‰‹–ÿ‰‘ÿÿ‘§Ï((ÄÅ•òÄ†ÖôΩ±±Öçï¡—Öç•Ω∏§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄù9Ω∏ÅÕîÅÖ—Ω¡Ω‘ÅÑÅ¡ïÕ—ÖπÑÅçºÅ•ëïπ—•ô•çÖëΩ»Ä‰‹–ÿ‰‘ÿÿ‘ú(ÄÄÄÄ§Ï(ÄÅÙ((ÄÅçΩπÕ–ÅçÖâïçï•…ÖÃÄÙÅôΩ±±Öçï¡—Öç•Ω∏(ÄÄÄÄπùï—IÖπùî†(ÄÄÄÄÄÄƒ∞(ÄÄÄÄÄÄƒ∞(ÄÄÄÄÄÄƒ∞(ÄÄÄÄÄÅôΩ±±Öçï¡—Öç•Ω∏πùï—1ÖÕ—Ω±’µ∏†§(ÄÄÄÄ§(ÄÄÄÄπùï—YÖ±’ïÃ†•l¡tÏ((ÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÄùAïÕ—ÖπÑÅçΩ……ïç—ÑËÄúÄ¨(ÄÄÄÅôΩ±±Öçï¡—Öç•Ω∏πùï—9Öµî†§(ÄÄ§Ï((ÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÄùÖâïçï•…ÖÃËÄúÄ¨(ÄÄÄÅçÖâïçï•…ÖÃπ©Ω•∏†úÅÄú§(ÄÄ§Ï)Ù(()ô’πç—•Ω∏Å…ï·•Õ—…Ö…çï¡—Öç•Ω∏°ëÖ—ΩÃ§ÅÏ(ÄÅçΩπÕ–Å±•â…Ωçï¡—Öç•Ω∏ÄÙÅM¡…ïÖëÕ°ïï—¡¿πΩ¡ïπ	Â%ê†(ÄÄÄÄú≈ùπëED≈E1—ú…±UT·9Ñ’≠ÕTÕTŸ›i9·)$…eîŸË›5‘›¨ú(ÄÄ§Ï((ÄÅçΩπÕ–ÅôΩ±±Öçï¡—Öç•Ω∏ÄÙ(ÄÄÄÅ±•â…Ωçï¡—Öç•Ω∏πùï—M°ïï—	Â%ê†‰‹–ÿ‰‘ÿÿ‘§Ï((ÄÅ•òÄ†ÖôΩ±±Öçï¡—Öç•Ω∏§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄù9Ω∏ÅÕîÅÖ—Ω¡Ω‘ÅÑÅ¡ïÕ—ÖπÑÅçï¡—ÖçßÕ∏ú(ÄÄÄÄ§Ï(ÄÅÙ((ÄÅôΩ±±Öçï¡—Öç•Ω∏πÖ¡¡ïπëIΩ‹°l(ÄÄÄÅU—•±•—•ïÃπùï—U’•ê†§∞(ÄÄÄÅëÖ—ΩÃπïµÖ•∞ÅÒÄúú∞(ÄÄÄÅπï‹ÅÖ—î†§∞(ÄÄÄÅëÖ—ΩÃπŸï…Õ•Ω∏ÅÒÄúú∞(ÄÄÄÅëÖ—ΩÃπ—ï·—Ω1ïùÖ∞ÅÒÄúú∞(ÄÄÄÅëÖ—ΩÃπÖçï¡—Ö•πïÃÄÙÙÙÅ—…’î∞(ÄÄÄÅëÖ—ΩÃπ¡ï…ÕΩÑÅÒÄúú∞(ÄÄÄÅëÖ—ΩÃπ’Õ’Ö…•Ω]ïàÅÒÄúú∞(ÄÄÄÅëÖ—ΩÃπÖµâ•—ºÅÒÄúú∞(ÄÄÄÅëÖ—ΩÃπçÖπ±îÅÒÄúú∞(ÄÄÄÅëÖ—ΩÃπëÖ—ÖIï—•…ÖëÑÅÒÄúú(ÄÅt§Ï((ÄÅM¡…ïÖëÕ°ïï—¡¿πô±’Õ††§Ï((ÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÄùçï¡—ÖçßÕ∏ÅïÕç…•—ÑÅçΩ……ïç—Öµïπ—îú(ÄÄ§Ï)Ù(()ô’πç—•Ω∏Å—ïπçï¡—Öç•ΩπY•·ïπ—ï|°çΩ……ïº∞ÅŸï…Õ•Ω∏§ÅÏ(ÄÅçΩπÕ–Å±•â…Ωçï¡—Öç•Ω∏ÄÙÅM¡…ïÖëÕ°ïï—¡¿πΩ¡ïπ	Â%ê†(ÄÄÄÄú≈ùπëED≈E1—ú…±UT·9Ñ’≠ÕTÕTŸ›i9·)$…eîŸË›5‘›¨ú(ÄÄ§Ï((ÄÅçΩπÕ–ÅôΩ±±Öçï¡—Öç•Ω∏ÄÙ(ÄÄÄÅ±•â…Ωçï¡—Öç•Ω∏πùï—M°ïï—	Â%ê†‰‹–ÿ‰‘ÿÿ‘§Ï((ÄÅ•òÄ†ÖôΩ±±Öçï¡—Öç•Ω∏§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄù9Ω∏ÅÕîÅÖ—Ω¡Ω‘ÅÑÅ¡ïÕ—ÖπÑÅçï¡—ÖçßÕ∏ú(ÄÄÄÄ§Ï(ÄÅÙ((ÄÅçΩπÕ–ÅŸÖ±Ω…ïÃÄÙ(ÄÄÄÅôΩ±±Öçï¡—Öç•Ω∏πùï—Ö—ÖIÖπùî†§πùï—YÖ±’ïÃ†§Ï(ÄÅ•òÄ°ŸÖ±Ω…ïÃπ±ïπù—†ÄÄ»§Å…ï—’…∏ÅôÖ±ÕîÏ((ÄÅçΩπÕ–ÅçÖâïçï•…ÖÃÄÙÅŸÖ±Ω…ïÕl¡tπµÖ¿°ô’πç—•Ω∏°ŸÖ±Ω»§ÅÏ(ÄÄÄÅ…ï—’…∏ÅπΩ…µÖ±•ÈÖ…Öâïçï•…ÖAΩ…—Ö±|°ŸÖ±Ω»§Ï(ÄÅÙ§Ï((ÄÅçΩπÕ–ÅçΩ±’µπÖµÖ•∞ÄÙÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|†(ÄÄÄÅçÖâïçï•…ÖÃ∞(ÄÄÄÅlùçΩ……ïΩï±ïç—…Ωπ•çºú∞ÄùïµÖ•∞ú∞ÄùçΩ……ïºùt(ÄÄ§Ï(ÄÅçΩπÕ–ÅçΩ±’µπÖYï…Õ•Ω∏ÄÙÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|†(ÄÄÄÅçÖâïçï•…ÖÃ∞(ÄÄÄÅlùŸï…Õ•Ω∏ùt(ÄÄ§Ï(ÄÅçΩπÕ–ÅçΩ±’µπÖçï¡—ÑÄÙÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|†(ÄÄÄÅçÖâïçï•…ÖÃ∞(ÄÄÄÅlùÖçï¡—Öô•πïÃú∞ÄùÖçï¡—Ñùt(ÄÄ§Ï(ÄÅçΩπÕ–ÅçΩ±’µπÖIï—•…ÖëÑÄÙÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|†(ÄÄÄÅçÖâïçï•…ÖÃ∞(ÄÄÄÅlùëÖ—Ö…ï—•…ÖëÑú∞Äùôïç°Ö…ï—•…ÖëÑùt(ÄÄ§Ï((ÄÅ•òÄ†(ÄÄÄÅçΩ±’µπÖµÖ•∞ÄÙÙÙÄ¥ƒÅÒ(ÄÄÄÅçΩ±’µπÖYï…Õ•Ω∏ÄÙÙÙÄ¥ƒÅÒ(ÄÄÄÅçΩ±’µπÖçï¡—ÑÄÙÙÙÄ¥ƒ(ÄÄ§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄùÖ±—Ö∏ÅçΩ±’µπÖÃÅΩâ…•ùÖ—Ω…•ÖÃÅπÑÅôΩ±±ÑÅçï¡—ÖçßÕ∏ú(ÄÄÄÄ§Ï(ÄÅÙ((ÄÅôΩ»Ä°±ï–Å§ÄÙÅŸÖ±Ω…ïÃπ±ïπù—†Ä¥ÄƒÏÅ§Ä¯Ä¿ÏÅ§Ä¥ÙÄƒ§ÅÏ(ÄÄÄÅçΩπÕ–Åô•±ÑÄÙÅŸÖ±Ω…ïÕm•tÏ(ÄÄÄÅçΩπÕ–ÅµïÕµΩΩ……ïºÄÙ(ÄÄÄÄÄÅM—…•πú°ô•±ÖmçΩ±’µπÖµÖ•±tÅÒÄúú§(ÄÄÄÄÄÄÄÄπ—…•¥†§(ÄÄÄÄÄÄÄÄπ—Ω1Ω›ï…ÖÕî†§ÄÙÙÙÅçΩ……ïºÏ(ÄÄÄÅçΩπÕ–ÅµïÕµÖYï…Õ•Ω∏ÄÙ(ÄÄÄÄÄÅM—…•πú°ô•±ÖmçΩ±’µπÖYï…Õ•ΩπtÅÒÄúú§π—…•¥†§ÄÙÙÙ(ÄÄÄÄÄÅŸï…Õ•Ω∏Ï(ÄÄÄÅçΩπÕ–ÅÖçï¡—ÖëÑÄÙ(ÄÄÄÄÄÅŸÖ±Ω…	ΩΩ±ïÖπΩAΩ…—Ö±|°ô•±ÖmçΩ±’µπÖçï¡—Öt§Ï(ÄÄÄÅçΩπÕ–Å…ï—•…ÖëÑÄÙ(ÄÄÄÄÄÅçΩ±’µπÖIï—•…ÖëÑÄÑÙÙÄ¥ƒÄòò(ÄÄÄÄÄÅM—…•πú°ô•±ÖmçΩ±’µπÖIï—•…ÖëÖtÅÒÄúú§π—…•¥†§ÄÑÙÙÄúúÏ((ÄÄÄÅ•òÄ†(ÄÄÄÄÄÅµïÕµΩΩ……ïºÄòò(ÄÄÄÄÄÅµïÕµÖYï…Õ•Ω∏Äòò(ÄÄÄÄÄÅÖçï¡—ÖëÑÄòò(ÄÄÄÄÄÄÖ…ï—•…ÖëÑ(ÄÄÄÄ§ÅÏ(ÄÄÄÄÄÅ…ï—’…∏Å—…’îÏ(ÄÄÄÅÙ(ÄÅÙ((ÄÅ…ï—’…∏ÅôÖ±ÕîÏ)Ù(()ô’πç—•Ω∏Å¡…ΩâÖ…Õç…•—’…Öçï¡—Öç•Ω∏†§ÅÏ(ÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÄùÅô’πçßÕ∏Å¡…ΩâÖ…Õç…•—’…Öçï¡—Öç•Ω∏ÅôΩ§Å…ïçø≈ïç•ëÑÅçΩ……ïç—Öµïπ—îú(ÄÄ§Ï)Ù)ô’πç—•Ω∏Å¡…ΩâÖ…AΩÕ—çï¡—Öç•Ω∏†§ÅÏ(ÄÅçΩπÕ–Å¡…Ω¡•ïëÖëïÃÄÙ(ÄÄÄÅA…Ω¡ï…—•ïÕMï…Ÿ•çîπùï—Mç…•¡—A…Ω¡ï…—•ïÃ†§Ï((ÄÅçΩπÕ–Å—Ω≠ï∏ÄÙ(ÄÄÄÅ¡…Ω¡•ïëÖëïÃπùï—A…Ω¡ï…—‰†ù]	}]I%Q}Q=-8ú§Ï((ÄÅçΩπÕ–ÅçΩ……ïºÄÙÅM—…•πú†(ÄÄÄÅ¡…Ω¡•ïëÖëïÃπùï—A…Ω¡ï…—‰†ù]	}QMQ}5%0ú§ÅÒÄúú(ÄÄ§(ÄÄÄÄπ—…•¥†§(ÄÄÄÄπ—Ω1Ω›ï…ÖÕî†§Ï((ÄÅçΩπÕ–ÅïŸïπ—ΩM•µ’±ÖëºÄÙÅÏ(ÄÄÄÅ¡ΩÕ—Ö—ÑËÅÏ(ÄÄÄÄÄÅçΩπ—ïπ—ÃËÅ)M=8πÕ—…•πù•ô‰°Ï(ÄÄÄÄÄÄÄÅ—Ω≠ï∏ËÅ—Ω≠ï∏∞(ÄÄÄÄÄÄÄÅÖçç•Ω∏ËÄù…ï·•Õ—…Ö…çï¡—Öç•Ω∏ú∞(ÄÄÄÄÄÄÄÅïµÖ•∞ËÅçΩ……ïº∞(ÄÄÄÄÄÄÄÅŸï…Õ•Ω∏ËÄùAI%Y%µ]¥ƒ∏¿ú∞(ÄÄÄÄÄÄÄÅ—ï·—Ω1ïùÖ∞Ë(ÄÄÄÄÄÄÄÄÄÄùQï·—ºÅëîÅ¡…ΩâÑÅëÑÅÖçï¡—ÖçßÕ∏ÅëÑÅ¡Ω≥µ—•çÑÅëîÅ¡…•ŸÖç•ëÖëî∏ú∞(ÄÄÄÄÄÄÄÅÖçï¡—Ö•πïÃËÅ—…’î∞(ÄÄÄÄÄÄÄÅ¡ï…ÕΩÑËÄúú∞(ÄÄÄÄÄÄÄÅ’Õ’Ö…•Ω]ïàËÄúú∞(ÄÄÄÄÄÄÄÅÖµâ•—ºË(ÄÄÄÄÄÄÄÄÄÄùçΩ…Ö±¡Ω±•ôΩπ•çÖ¡Ωπ—ïŸïë…ÑπΩ…úú(ÄÄÄÄÄÅÙ§(ÄÄÄÅÙ(ÄÅÙÏ((ÄÅçΩπÕ–Å…ïÕ¡ΩÕ—ÑÄÙÅëΩAΩÕ–°ïŸïπ—ΩM•µ’±Öëº§Ï((ÄÅçΩπÕΩ±îπ±Ωú†(ÄÄÄÅ…ïÕ¡ΩÕ—Ñπùï—Ωπ—ïπ–†§(ÄÄ§Ï)Ù((º®®(Ä®ÅQï·—ºÅ±ïùÖ∞ÅŸ•·ïπ—îÅëºÅ¡Ω…—Ö∞Å¡…•ŸÖëº∏(Ä®(Ä®ÅÕ—îÅ∑Õë’±ºÅïŸ•—ÑÅ≈’îÅºÅπÖŸïùÖëΩ»Åëïç•ëÑÅÑÅŸï…ÕßÕ∏ÅΩ‘ÅºÅçΩπ—•ëºÅÖçï¡—Öëº∏(Ä®ÅQÖπ—ºÅÑÅçΩµ¡…ΩâÖçßÕ∏ÅçΩµºÅºÅ…ï·•Õ—…ºÅ…ïÕΩ±Ÿï∏ÅÑÅô•±ÑÅÖç—•ŸÑÅë•…ïç—Öµïπ—î(Ä®ÅëïÕëîÅQï·—ΩÕ1ïùÖ•Ã∏(Ä®º)çΩπÕ–ÅAQ%=9}MAIM!Q}%|ÄÙ(ÄÄú≈ùπëED≈E1—ú…±UT·9Ñ’≠ÕTÕTŸ›i9·)$…eîŸË›5‘›¨úÏ)çΩπÕ–ÅQaQ=M}1%M}M!Q}%|ÄÙÄ»¿»‘–ƒ»»¿‡Ï)çΩπÕ–ÅQaQ=}11}A=IQ1}%|ÄÙÄùAI%Y%}]úÏ()ô’πç—•Ω∏ÅΩâ—ï…Qï·—Ω1ïùÖ±Y•·ïπ—ï|†§ÅÏ(ÄÅçΩπÕ–Å±•â…ºÄÙÅM¡…ïÖëÕ°ïï—¡¿πΩ¡ïπ	Â%ê†(ÄÄÄÅAQ%=9}MAIM!Q}%|(ÄÄ§Ï(ÄÅçΩπÕ–ÅôΩ±±ÑÄÙÅ±•â…ºπùï—M°ïï—	Â%ê°QaQ=M}1%M}M!Q}%|§Ï((ÄÅ•òÄ†ÖôΩ±±ÑÅÒÅôΩ±±Ñπùï—9Öµî†§ÄÑÙÙÄùQï·—ΩÕ1ïùÖ•Ãú§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†ù9Ω∏ÅÕîÅÖ—Ω¡Ω‘ÅÑÅ¡ïÕ—ÖπÑÅQï·—ΩÕ1ïùÖ•ÃÅçΩπô•ù’…ÖëÑú§Ï(ÄÅÙ((ÄÅçΩπÕ–ÅŸÖ±Ω…ïÃÄÙÅôΩ±±Ñπùï—Ö—ÖIÖπùî†§πùï—YÖ±’ïÃ†§Ï(ÄÅ•òÄ°ŸÖ±Ω…ïÃπ±ïπù—†ÄÄ»§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†ùQï·—ΩÕ1ïùÖ•ÃÅπΩ∏ÅçΩπ”•∏Åπ•πüÈ∏Å—ï·—ºÅ±ïùÖ∞ú§Ï(ÄÅÙ((ÄÅçΩπÕ–ÅçÖâïçï•…ÖÃÄÙÅŸÖ±Ω…ïÕl¡tπµÖ¿°ô’πç—•Ω∏°ŸÖ±Ω»§ÅÏ(ÄÄÄÅ…ï—’…∏ÅπΩ…µÖ±•ÈÖ…Öâïçï•…ÖAΩ…—Ö±|°ŸÖ±Ω»§Ï(ÄÅÙ§Ï(ÄÅçΩπÕ–ÅçΩ±’µπÖÃÄÙÅÏ(ÄÄÄÅ•êËÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|°çÖâïçï•…ÖÃ∞Ålù•êùt§∞(ÄÄÄÅŸï…Õ•Ω∏ËÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|°çÖâïçï•…ÖÃ∞ÅlùŸï…Õ•Ω∏ùt§∞(ÄÄÄÅ—•—’±ºËÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|°çÖâïçï•…ÖÃ∞Ålù—•—’±ºùt§∞(ÄÄÄÅ—ï·—ºËÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|°çÖâïçï•…ÖÃ∞Ålù—ï·—ºùt§∞(ÄÄÄÅëÖ—ÖY•·ïπç•ÑËÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|†(ÄÄÄÄÄÅçÖâïçï•…ÖÃ∞(ÄÄÄÄÄÅlùëÖ—ÖŸ•·ïπç•Ñú∞Äùôïç°ÖŸ•ùïπç•Ñùt(ÄÄÄÄ§∞(ÄÄÄÅÖç—•ŸºËÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|°çÖâïçï•…ÖÃ∞ÅlùÖç—•Ÿºùt§∞(ÄÄÄÅÖµâ•—ºËÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|°çÖâïçï•…ÖÃ∞ÅlùÖµâ•—ºùt§∞(ÄÄÄÅ•ëQï·—Ω1ïùÖ∞ËÅ•πë•çïÖâïçï•…ÖAΩ…—Ö±|†(ÄÄÄÄÄÅçÖâïçï•…ÖÃ∞(ÄÄÄÄÄÅlù•ë—ï·—Ω±ïùÖ∞ùt(ÄÄÄÄ§(ÄÅÙÏ((ÄÅ=â©ïç–π≠ïÂÃ°çΩ±’µπÖÃ§πôΩ…Öç†°ô’πç—•Ω∏°πΩµî§ÅÏ(ÄÄÄÅ•òÄ°çΩ±’µπÖÕmπΩµïtÄÙÙÙÄ¥ƒ§ÅÏ(ÄÄÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄÄÄùÖ±—ÑÅÑÅçΩ±’µπÑÅΩâ…•ùÖ—Ω…•ÑÄúÄ¨ÅπΩµîÄ¨ÄúÅï∏ÅQï·—ΩÕ1ïùÖ•Ãú(ÄÄÄÄÄÄ§Ï(ÄÄÄÅÙ(ÄÅÙ§Ï((ÄÅçΩπÕ–ÅÖùΩ…ÑÄÙÅπï‹ÅÖ—î†§Ï(ÄÅçΩπÕ–ÅçÖπë•ëÖ—ÖÃÄÙÅŸÖ±Ω…ïÃ(ÄÄÄÄπÕ±•çî†ƒ§(ÄÄÄÄπµÖ¿°ô’πç—•Ω∏°ô•±Ñ∞Å•πë•çî§ÅÏ(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅπΩ…µÖ±•ÈÖ…Ö—ÖQï·—Ω1ïùÖ±|†(ÄÄÄÄÄÄÄÅô•±ÖmçΩ±’µπÖÃπëÖ—ÖY•·ïπç•Öt(ÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÅ…ï—’…∏ÅÏÅô•±ÑËÅô•±Ñ∞Å•πë•çîËÅ•πë•çî∞ÅëÖ—ÑËÅëÖ—ÑÅÙÏ(ÄÄÄÅÙ§(ÄÄÄÄπô•±—ï»°ô’πç—•Ω∏°çÖπë•ëÖ—Ñ§ÅÏ(ÄÄÄÄÄÅçΩπÕ–Åô•±ÑÄÙÅçÖπë•ëÖ—Ñπô•±ÑÏ(ÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÅM—…•πú°ô•±ÖmçΩ±’µπÖÃπ•ëtÅÒÄúú§π—…•¥†§ÄÙÙÙ(ÄÄÄÄÄÄÄÄÄÅQaQ=}11}A=IQ1}%|Äòò(ÄÄÄÄÄÄÄÅŸÖ±Ω…	ΩΩ±ïÖπΩAΩ…—Ö±|°ô•±ÖmçΩ±’µπÖÃπÖç—•ŸΩt§Äòò(ÄÄÄÄÄÄÄÅçÖπë•ëÖ—ÑπëÖ—ÑÄòò(ÄÄÄÄÄÄÄÅçÖπë•ëÖ—ÑπëÖ—Ñπùï—Q•µî†§ÄÙÅÖùΩ…Ñπùï—Q•µî†§(ÄÄÄÄÄÄ§Ï(ÄÄÄÅÙ§(ÄÄÄÄπÕΩ…–°ô’πç—•Ω∏°Ñ∞Åà§ÅÏ(ÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÅàπëÖ—Ñπùï—Q•µî†§Ä¥ÅÑπëÖ—Ñπùï—Q•µî†§ÅÒ(ÄÄÄÄÄÄÄÅàπ•πë•çîÄ¥ÅÑπ•πë•çî(ÄÄÄÄÄÄ§Ï(ÄÄÄÅÙ§Ï((ÄÅ•òÄ†ÖçÖπë•ëÖ—ÖÃπ±ïπù—†§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†(ÄÄÄÄÄÄù9Ω∏Å°Ö§Å’∏Å—ï·—ºÅ±ïùÖ∞ÅÖç—•ŸºÅîÅŸ•·ïπ—îÅ¡Ö…ÑÅºÅ¡Ω…—Ö∞Å¡…•ŸÖëºú(ÄÄÄÄ§Ï(ÄÅÙ((ÄÅçΩπÕ–Åô•±ÑÄÙÅçÖπë•ëÖ—ÖÕl¡tπô•±ÑÏ(ÄÅçΩπÕ–Å…ïÕ’±—ÖëºÄÙÅÏ(ÄÄÄÅ•êËÅM—…•πú°ô•±ÖmçΩ±’µπÖÃπ•ëtÅÒÄúú§π—…•¥†§∞(ÄÄÄÅ•ëQï·—Ω1ïùÖ∞ËÅM—…•πú†(ÄÄÄÄÄÅô•±ÖmçΩ±’µπÖÃπ•ëQï·—Ω1ïùÖ±tÅÒÄúú(ÄÄÄÄ§π—…•¥†§∞(ÄÄÄÅŸï…Õ•Ω∏ËÅM—…•πú°ô•±ÖmçΩ±’µπÖÃπŸï…Õ•ΩπtÅÒÄúú§π—…•¥†§∞(ÄÄÄÅ—•—’±ºËÅM—…•πú°ô•±ÖmçΩ±’µπÖÃπ—•—’±ΩtÅÒÄúú§π—…•¥†§∞(ÄÄÄÅ—ï·—ºËÅM—…•πú°ô•±ÖmçΩ±’µπÖÃπ—ï·—ΩtÅÒÄúú§π—…•¥†§∞(ÄÄÄÅÖµâ•—ºËÅM—…•πú°ô•±ÖmçΩ±’µπÖÃπÖµâ•—ΩtÅÒÄúú§π—…•¥†§∞(ÄÄÄÅëÖ—ÖY•·ïπç•ÑËÅU—•±•—•ïÃπôΩ…µÖ—Ö—î†(ÄÄÄÄÄÅçÖπë•ëÖ—ÖÕl¡tπëÖ—Ñ∞(ÄÄÄÄÄÄù’…Ω¡îΩ5Öë…•êú∞(ÄÄÄÄÄÄùÂÂÂ‰µ54µëêú(ÄÄÄÄ§(ÄÅÙÏ((ÄÅ•òÄ†Ö…ïÕ’±—ÖëºπŸï…Õ•Ω∏ÅÒÄÖ…ïÕ’±—Öëºπ—•—’±ºÅÒÄÖ…ïÕ’±—Öëºπ—ï·—º§ÅÏ(ÄÄÄÅ—°…Ω‹Åπï‹Å……Ω»†ù<Å—ï·—ºÅ±ïùÖ∞ÅŸ•·ïπ—îÅïÕ”ÑÅ•πçΩµ¡±ï—ºú§Ï(ÄÅÙ(ÄÅ…ï—’…∏Å…ïÕ’±—ÖëºÏ)Ù()ô’πç—•Ω∏ÅπΩ…µÖ±•ÈÖ…Ö—ÖQï·—Ω1ïùÖ±|°ŸÖ±Ω»§ÅÏ(ÄÅ•òÄ†(ÄÄÄÅ=â©ïç–π¡…Ω—Ω—Â¡îπ—ΩM—…•πúπçÖ±∞°ŸÖ±Ω»§ÄÙÙÙÄùmΩâ©ïç–ÅÖ—ïtúÄòò(ÄÄÄÄÖ•Õ9Ö8°ŸÖ±Ω»πùï—Q•µî†§§(ÄÄ§ÅÏ(ÄÄÄÅ…ï—’…∏ÅŸÖ±Ω»Ï(ÄÅÙ((ÄÅçΩπÕ–Å—ï·—ºÄÙÅM—…•πú°ŸÖ±Ω»ÅÒÄúú§π—…•¥†§Ï(ÄÅçΩπÕ–Å¡Ö…—ïÃÄÙÅ—ï·—ºπµÖ—ç††Ωx°qëÏƒ∞…Ù•mpº∏µt°qëÏƒ∞…Ù•mpº∏µt°qëÏ—Ù§êº§Ï(ÄÅ•òÄ†Ö¡Ö…—ïÃ§Å…ï—’…∏Åπ’±∞Ï((ÄÅçΩπÕ–ÅëÖ—ÑÄÙÅπï‹ÅÖ—î†(ÄÄÄÅ9’µâï»°¡Ö…—ïÕlÕt§∞(ÄÄÄÅ9’µâï»°¡Ö…—ïÕl…t§Ä¥Äƒ∞(ÄÄÄÅ9’µâï»°¡Ö…—ïÕl≈t§(ÄÄ§Ï(ÄÅ…ï—’…∏Å•Õ9Ö8°ëÖ—Ñπùï—Q•µî†§§Ä¸Åπ’±∞ÄËÅëÖ—ÑÏ)Ù()ô’πç—•Ω∏ÅçΩµ¡…ΩâÖ…çï¡—Öç•ΩπAΩ…—Ö±|°çΩ……ïº§ÅÏ(ÄÅçΩπÕ–Å—ï·—Ω1ïùÖ∞ÄÙÅΩâ—ï…Qï·—Ω1ïùÖ±Y•·ïπ—ï|†§Ï(ÄÅ…ï—’…∏ÅÏ(ÄÄÄÅΩ¨ËÅ—…’î∞(ÄÄÄÅÖçï¡—Öç•ΩπY•·ïπ—îËÅ—ïπçï¡—Öç•ΩπY•·ïπ—ï|†(ÄÄÄÄÄÅçΩ……ïº∞(ÄÄÄÄÄÅ—ï·—Ω1ïùÖ∞πŸï…Õ•Ω∏(ÄÄÄÄ§∞(ÄÄÄÅ—ï·—Ω1ïùÖ∞ËÅ—ï·—Ω1ïùÖ∞(ÄÅÙÏ)Ù()ô’πç—•Ω∏Å…ï·•Õ—…Ö…çï¡—Öç•ΩπAΩ…—Ö±|°çΩ……ïº§ÅÏ(ÄÅçΩπÕ–Å’Õ’Ö…•ºÄÙÅΩâ—ï…=’…ïÖ…UÕ’Ö…•Ω]ïâAΩ…µÖ•±|°çΩ……ïº§Ï(ÄÅ•òÄ†Ö’Õ’Ö…•º§ÅÏ(ÄÄÄÅ…ï—’…∏ÅÏÅΩ¨ËÅôÖ±Õî∞Åï……ºËÄùUÕ’Ö…•ºÅπΩ∏ÅÖ’—Ω…•ÈÖëºúÅÙÏ(ÄÅÙ((ÄÅçΩπÕ–Å—ï·—Ω1ïùÖ∞ÄÙÅΩâ—ï…Qï·—Ω1ïùÖ±Y•·ïπ—ï|†§Ï(ÄÅ…ï·•Õ—…Ö…çï¡—Öç•Ω∏°Ï(ÄÄÄÅïµÖ•∞ËÅçΩ……ïº∞(ÄÄÄÅŸï…Õ•Ω∏ËÅ—ï·—Ω1ïùÖ∞πŸï…Õ•Ω∏∞(ÄÄÄÅ—ï·—Ω1ïùÖ∞ËÅ—ï·—Ω1ïùÖ∞π—ï·—º∞(ÄÄÄÅÖçï¡—Ö•πïÃËÅ—…’î∞(ÄÄÄÅ¡ï…ÕΩÑËÅ’Õ’Ö…•ºπ¡ï…ÕΩÑ∞(ÄÄÄÅ’Õ’Ö…•Ω]ïàËÅ’Õ’Ö…•ºπ’Õ’Ö…•Ω]ïà∞(ÄÄÄÅÖµâ•—ºËÅ—ï·—Ω1ïùÖ∞πÖµâ•—º∞(ÄÄÄÅçÖπ±îËÄù]ïàú∞(ÄÄÄÅëÖ—ÖIï—•…ÖëÑËÄúú(ÄÅÙ§Ï((ÄÅ…ï—’…∏ÅÏ(ÄÄÄÅΩ¨ËÅ—…’î∞(ÄÄÄÅµïπÕÖ·îËÄùçï¡—ÖçßÕ∏Å…ï·•Õ—…ÖëÑÅçΩ……ïç—Öµïπ—îú∞(ÄÄÄÅŸï…Õ•Ω∏ËÅ—ï·—Ω1ïùÖ∞πŸï…Õ•Ω∏∞(ÄÄÄÅ—ï·—Ω1ïùÖ±%êËÅ—ï·—Ω1ïùÖ∞π•ëQï·—Ω1ïùÖ∞∞(ÄÄÄÅ’Õ’Ö…•ºËÅ’Õ’Ö…•º(ÄÅÙÏ)Ù()ô’πç—•Ω∏Å¡…ΩâÖ…Qï·—Ω1ïùÖ±Y•·ïπ—î†§ÅÏ(ÄÅçΩπÕΩ±îπ±Ωú°)M=8πÕ—…•πù•ô‰°Ωâ—ï…Qï·—Ω1ïùÖ±Y•·ïπ—ï|†§§§Ï)Ù(