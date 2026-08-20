function configurarProba() {
  const propiedades = PropertiesService.getScriptProperties();
  const token = Utilities.getUuid().replaceAll('-', '') + Utilities.getUuid().replaceAll('-', '');
  propiedades.setProperties({ WEB_WRITE_TOKEN: token, WEB_TEST_EMAIL: Session.getEffectiveUser().getEmail().toLowerCase() });
  console.log('Configuración creada correctamente.');
}

function doGet(e) {
  try {
    const recurso = String(e && e.parameter ? e.parameter.recurso || '' : '').trim().toLowerCase();
    if (recurso === 'publicacions') return respostaJSON(listarPublicacionsWeb_());
    return respostaJSON({ ok: true, servizo: 'UsuariosWeb', escritura: 'protexida' });
  } catch (erro) {
    console.error(erro && erro.stack ? erro.stack : erro);
    return respostaJSON({ ok: false, erro: String(erro && erro.message ? erro.message : 'Non foi posible completar a solicitude') });
  }
}

function doPost(e) {
  const bloqueo = LockService.getScriptLock();
  let correo = '';
  let accion = '';
  try {
    const datos = JSON.parse(e.postData?.contents || '{}');
    accion = String(datos.accion || '').trim();
    const propiedades = PropertiesService.getScriptProperties();
    const tokenCorrecto = propiedades.getProperty('WEB_WRITE_TOKEN');
    correo = String(datos.email || datos.correoElectronico || '').trim().toLowerCase();
    if (!tokenCorrecto || datos.token !== tokenCorrecto) return respostaJSON({ ok:false, erro:'Non autorizado' });

    if (accion === 'rexistrarSolicitudeWeb') { bloqueo.waitLock(10000); return respostaJSON(rexistrarSolicitudeWeb_(datos)); }
    if (accion === 'obterTextoLegalVixente') return respostaJSON({ ok:true, textoLegal: obterTextoLegalVixente_() });
    if (accion === 'comprobarAceptacion') return respostaJSON(comprobarAceptacionPortal_(correo));
    if (accion === 'rexistrarAceptacion') { bloqueo.waitLock(10000); return respostaJSON(rexistrarAceptacionPortal_(correo)); }
    if (accion === 'obterPerfil') return respostaJSON(obterPerfilPortal_(datos));
    if (accion === 'actualizarPerfil') { bloqueo.waitLock(10000); return respostaJSON(actualizarPerfilPortal_(datos)); }
    if (accion === 'obterDocumentoConcerto') return respostaJSON(obterDocumentoConcerto_(datos));
    if (accion === 'listarAsistenciasConcertosPortal') return respostaJSON(listarAsistenciasConcertosPortal_(datos));
    if (accion === 'listarConcertosAdministracionPortal') return respostaJSON(listarConcertosAdministracionPortal_(datos));
    if (accion === 'obterXestionConcertoAdministracionPortal') return respostaJSON(obterXestionConcertoAdministracionPortal_(datos));
    if (accion === 'actualizarConcertoAdministracionPortal') { bloqueo.waitLock(10000); return respostaJSON(actualizarConcertoAdministracionPortal_(datos)); }
    if (accion === 'gardarProgramaConcertoAdministracionPortal') { bloqueo.waitLock(10000); return respostaJSON(gardarProgramaConcertoAdministracionPortal_(datos)); }
    if (accion === 'gardarAsistentesConcertoAdministracionPortal') { bloqueo.waitLock(10000); return respostaJSON(gardarAsistentesConcertoAdministracionPortal_(datos)); }
    if (accion === 'actualizarMedioConcertoAdministracionPortal') { bloqueo.waitLock(10000); return respostaJSON(actualizarMedioConcertoAdministracionPortal_(datos)); }
    if (accion === 'listarEnsaiosPortal') return respostaJSON(listarEnsaiosPortal_(datos));
    if (accion === 'gardarAsistenciaEnsaioPortal') { bloqueo.waitLock(10000); return respostaJSON(gardarAsistenciaEnsaioPortal_(datos)); }
    if (accion === 'gardarEnsaioRepertorioPortal') { bloqueo.waitLock(10000); return respostaJSON(gardarEnsaioRepertorioPortal_(datos)); }
    if (accion === 'eliminarEnsaioPortal') { bloqueo.waitLock(10000); return respostaJSON(eliminarEnsaioPortal_(datos)); }
    if (accion === 'eliminarEnsaioRepertorioPortal') { bloqueo.waitLock(10000); return respostaJSON(eliminarEnsaioRepertorioPortal_(datos)); }
    if (accion === 'gardarEnsaioPortal') { bloqueo.waitLock(10000); return respostaJSON(gardarEnsaioPortal_(datos)); }
    if (accion === 'obterSeguimentoEnsaiosPortal') return respostaJSON(obterSeguimentoEnsaiosPortal_(datos));
    if (accion === 'listarDocumentacionPortal') return respostaJSON(listarDocumentacionPortal_(datos));
    if (accion === 'obterFicheiroDocumentacion') return respostaJSON(obterFicheiroDocumentacion_(datos));
    if (accion === 'listarRepertorioPortal') return respostaJSON(listarRepertorioPortal_(datos));
    if (accion === 'obterFicheiroRepertorio') return respostaJSON(obterFicheiroRepertorio_(datos));
    if (accion === 'subirFoto') { bloqueo.waitLock(10000); return respostaJSON(subirFotoPortal_(datos)); }
    if (accion === 'listarFotosRevision') return respostaJSON(listarFotosRevisionPortal_(datos));
    if (accion === 'listarFotosGaleria') return respostaJSON(listarFotosGaleriaPortal_());
    if (accion === 'actualizarRevisionFoto') { bloqueo.waitLock(10000); return respostaJSON(actualizarRevisionFotoPortal_(datos)); }
    if (accion === 'listarFotosPublicadas') return respostaJSON(listarFotosPublicadasPortal_(datos));
    if (accion === 'actualizarPublicacionFoto') return respostaJSON(actualizarPublicacionFotoPortal_(datos));
    if (accion === 'obterFotoParaR2') return respostaJSON(obterFotoParaR2Portal_(datos));
    if (accion === 'listarFotosPendentesR2') return respostaJSON(listarFotosPendentesR2Portal_(datos));
    if (accion === 'gardarRutasFotoR2') return respostaJSON(gardarRutasFotoR2Portal_(datos));
    return respostaJSON({ ok:false, erro:'Acción non permitida' });
  } catch (erro) {
    console.error(erro && erro.stack ? erro.stack : erro);
    return respostaJSON({ ok:false, erro:String(erro && erro.message ? erro.message : 'Erro interno') });
  } finally {
    try { bloqueo.releaseLock(); } catch (_) {}
  }
}

function respostaJSON(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}
