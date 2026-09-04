/*
 * Ao entrar un administrador en Persoas, a API xa solicita
 * persoasV2InstalarTrigger. Aproveitamos esa chamada para:
 * - verificar o trigger da folla Persoas;
 * - verificar tamén o trigger de TextosLegais;
 * - reconstruír a caché Sheet → R2.
 *
 * Isto deixa R2 preparado tanto para datos/fotos como para o texto legal
 * vixente, sen facer que Xerar revisión dependa dunha lectura directa da Sheet.
 */
function persoasV2InstalarTriggerESincronizarPerfil_(datos) {
  var result = persoasV2InstalarTrigger_(datos);
  if (!result || result.ok !== true) return result;

  try {
    var legalTrigger = persoasV2InstalarTriggerTextosLegais_();
    result.triggerTextosLegais = legalTrigger && legalTrigger.ok === true;
    result.triggerTextosLegaisCreado = legalTrigger && legalTrigger.creado === true;
    if (!result.triggerTextosLegais) {
      result.avisoTriggerTextosLegais = String(
        legalTrigger && (legalTrigger.erro || legalTrigger.detalle) ||
        'Non se puido verificar o trigger de TextosLegais.'
      );
    }
  } catch (erroTriggerLegal) {
    result.triggerTextosLegais = false;
    result.avisoTriggerTextosLegais = String(
      erroTriggerLegal && erroTriggerLegal.message
        ? erroTriggerLegal.message
        : erroTriggerLegal
    );
    console.warn(
      'Persoas V2: non se puido verificar o trigger de TextosLegais: ' +
      result.avisoTriggerTextosLegais
    );
  }

  try {
    var token = persoasV2Texto_(
      PropertiesService.getScriptProperties().getProperty('WEB_WRITE_TOKEN')
    );
    if (!token) {
      result.syncPerfil = false;
      result.avisoSyncPerfil = 'WEB_WRITE_TOKEN non está configurado no Apps Script.';
      return result;
    }

    var version = persoasV2VersionActual_();
    var response = UrlFetchApp.fetch(PERSOAS_V2_CONFIG_.syncUrl, {
      method:'post',
      contentType:'application/json',
      payload:JSON.stringify({
        token:token,
        version:version,
        fonte:'admin-persoas-cache-r2'
      }),
      muteHttpExceptions:true,
      followRedirects:true
    });

    var code = response.getResponseCode();
    result.syncPerfil = code >= 200 && code < 300;
    result.syncPerfilStatus = code;
    if (!result.syncPerfil) {
      result.avisoSyncPerfil = 'A sincronización de Persoas/Perfil/TextosLegais respondeu ' + code + '.';
    }
  } catch (erro) {
    result.syncPerfil = false;
    result.avisoSyncPerfil = String(erro && erro.message ? erro.message : erro);
    console.warn('Persoas V2: non se puido refrescar a caché R2: ' + result.avisoSyncPerfil);
  }

  return result;
}
