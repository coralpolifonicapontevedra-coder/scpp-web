/*
 * Ao entrar un administrador en Persoas, a API xa solicita
 * persoasV2InstalarTrigger. Aproveitamos esa chamada para reconstruír tamén
 * a caché Sheet → R2 e deixar un marcador de Perfil para todas as persoas.
 * Así unha foto cambiada polo propio interesado en Perfil segue aparecendo
 * en Administración sen depender dunha segunda foto almacenada en R2.
 */
function persoasV2InstalarTriggerESincronizarPerfil_(datos) {
  var result = persoasV2InstalarTrigger_(datos);
  if (!result || result.ok !== true) return result;

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
        fonte:'admin-persoas-perfil-foto'
      }),
      muteHttpExceptions:true,
      followRedirects:true
    });

    var code = response.getResponseCode();
    result.syncPerfil = code >= 200 && code < 300;
    result.syncPerfilStatus = code;
    if (!result.syncPerfil) {
      result.avisoSyncPerfil = 'A sincronización de fotografías de Perfil respondeu ' + code + '.';
    }
  } catch (erro) {
    result.syncPerfil = false;
    result.avisoSyncPerfil = String(erro && erro.message ? erro.message : erro);
    console.warn('Persoas V2: non se puido refrescar a caché de fotos de Perfil: ' + result.avisoSyncPerfil);
  }

  return result;
}
