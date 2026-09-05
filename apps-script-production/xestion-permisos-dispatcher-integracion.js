/* Integración no doPost principal de SCPP Script - Pruebas.
 * NON crear un segundo doPost.
 *
 * Inserir estes bloques antes do rexistro final de "Acción non permitida".
 * O token xa se valida ao inicio do doPost actual.
 */

var ACCIONS_ADMIN_XESTION_PERMISOS_ = [
  'listarPermisosPortal',
  'gardarPermisoPortal',
  'gardarPermisosPortalLote',
  'eliminarPermisoPortal',
  'rexistrarActividadePortal',
  'listarActividadePortal',

  // Administración de doazóns
  'listarDoazonsAdministracion',
  'actualizarEstadoDoazonAdministracion',
  'eliminarDoazonAdministracion'
];

var ACCIONS_PERSOAS_ADMIN_PORTAL_ = [
  'crearPersoaAdministracion',
  'actualizarPersoaAdministracion',
  'cambiarEstadoPersoaAdministracion',
  'enviarRevisionsPersoasAdministracion',
  'estadoEnviosRevisionsPersoasAdministracion',
  'listarEnviosRevisionsPersoasAdministracion',
  'persoasV2Listar',
  'persoasV2SyncListar',
  'persoasV2Version',
  'persoasV2Crear',
  'persoasV2Actualizar',
  'persoasV2Estado',
  'persoasV2Eliminar',
  'persoasV2InstalarTrigger',
  'persoasV2FotoPerfilObter',
  'persoasV2FotoPerfilGardar',
  'persoasV2FotoPerfilEliminar'
];

var ACCIONS_FOTOS_ADMIN_PORTAL_ = [
  'comprobarFotosAdministracionPortal',
  'gardarFotoAdministracionPortal',
  'eliminarFotoAdministracionPortal',
  'eliminarFotoHuerfanaAdministracionPortal'
];

function despacharPersoasAdministracionPortal_(accion, datos) {
  if (ACCIONS_PERSOAS_ADMIN_PORTAL_.indexOf(accion) < 0) return null;

  if (accion === 'crearPersoaAdministracion') return crearPersoaAdministracion_(datos);
  if (accion === 'actualizarPersoaAdministracion') return actualizarPersoaAdministracion_(datos);
  if (accion === 'cambiarEstadoPersoaAdministracion') return cambiarEstadoPersoaAdministracion_(datos);
  if (accion === 'enviarRevisionsPersoasAdministracion') return enviarRevisionsPersoasAdministracion_(datos);
  if (accion === 'estadoEnviosRevisionsPersoasAdministracion') return estadoEnviosRevisionsPersoasAdministracion_(datos);
  if (accion === 'listarEnviosRevisionsPersoasAdministracion') return listarEnviosRevisionsPersoasAdministracion_(datos);
  if (accion === 'persoasV2Listar') return persoasV2Listar_(datos);
  if (accion === 'persoasV2SyncListar') return persoasV2SyncListar_(datos);
  if (accion === 'persoasV2Version') return persoasV2Version_(datos);
  if (accion === 'persoasV2Crear') return persoasV2Crear_(datos);
  if (accion === 'persoasV2Actualizar') return persoasV2Actualizar_(datos);
  if (accion === 'persoasV2Estado') return persoasV2Estado_(datos);
  if (accion === 'persoasV2Eliminar') return persoasV2Eliminar_(datos);
  if (accion === 'persoasV2InstalarTrigger') return persoasV2InstalarTriggerESincronizarPerfil_(datos);
  if (accion === 'persoasV2FotoPerfilObter') return persoasV2FotoPerfilObter_(datos);
  if (accion === 'persoasV2FotoPerfilGardar') return persoasV2FotoPerfilGardar_(datos);
  if (accion === 'persoasV2FotoPerfilEliminar') return persoasV2FotoPerfilEliminar_(datos);

  return null;
}

function despacharFotosAdministracionPortal_(accion, datos, bloqueo) {
  if (ACCIONS_FOTOS_ADMIN_PORTAL_.indexOf(accion) < 0) return null;

  if (accion === 'comprobarFotosAdministracionPortal') {
    return comprobarFotosAdministracionPortal_(datos);
  }

  if (accion === 'gardarFotoAdministracionPortal') {
    if (bloqueo && !bloqueo.hasLock()) bloqueo.waitLock(10000);
    return gardarFotoAdministracionPortal_(datos);
  }

  if (accion === 'eliminarFotoAdministracionPortal') {
    if (bloqueo && !bloqueo.hasLock()) bloqueo.waitLock(10000);
    return eliminarFotoAdministracionPortal_(datos);
  }

  if (accion === 'eliminarFotoHuerfanaAdministracionPortal') {
    if (bloqueo && !bloqueo.hasLock()) bloqueo.waitLock(10000);
    return eliminarFotoHuerfanaAdministracionPortal_(datos);
  }

  return null;
}

function autorizarXestionPermisosPortal_(accion, datos) {
  if (ACCIONS_ADMIN_XESTION_PERMISOS_.indexOf(accion) < 0) return null;

  var correo = String(
    datos && (datos.actorEmail || datos.email) || ''
  ).trim().toLowerCase();

  if (!correo) {
    return {
      ok: false,
      codigo: 'ADMIN_REQUIRED',
      erro: 'Non se puido identificar a conta administradora.'
    };
  }

  var permiso = resolverPermisosPortal_(correo);

  if (!permiso || permiso.escritura !== true) {
    return {
      ok: false,
      codigo: 'ADMIN_REQUIRED',
      erro: 'A túa conta non ten permisos de administración para esta operación.'
    };
  }

  return null;
}

function despacharXestionPermisosPortal_(accion, datos, bloqueo) {
  accion = String(accion || '').trim();

  var respostaPersoas = despacharPersoasAdministracionPortal_(accion, datos);

  if (respostaPersoas !== null) {
    rexistrarAcceso({
      email: String(datos && datos.email || '').trim().toLowerCase(),
      tipoEvento:
        accion.indexOf('persoasV2') === 0
          ? 'Persoas V2 · ' + accion
          : (
            accion === 'crearPersoaAdministracion'
              ? 'Crear persoa'
              : (
                accion === 'actualizarPersoaAdministracion'
                  ? 'Actualizar persoa'
                  : (
                    accion === 'cambiarEstadoPersoaAdministracion'
                      ? (respostaPersoas.activo ? 'Reactivar persoa' : 'Dar de baixa persoa')
                      : (
                        accion === 'estadoEnviosRevisionsPersoasAdministracion'
                          ? 'Consulta estado de revisións'
                          : (
                            accion === 'listarEnviosRevisionsPersoasAdministracion'
                              ? 'Auditoría de envíos de revisións'
                              : 'Envío masivo de revisións'
                          )
                      )
                  )
              )
          ),
      modulo: 'Administración · Persoas',
      resultado: respostaPersoas.ok ? 'Correcto' : 'Rexeitado',
      detalle: respostaPersoas.ok
        ? String(
            respostaPersoas.idPersoa ||
            respostaPersoas.enviados ||
            respostaPersoas.total ||
            respostaPersoas.version ||
            respostaPersoas.cotaRestante ||
            ''
          )
        : String(respostaPersoas.erro || '')
    });

    return respostaPersoas;
  }

  // Fotografías xa chega autorizada polo Worker mediante o permiso efectivo
  // do módulo en R2. Non se engade aquí outro rexistro sincrónico en Sheets.
  var respostaFotos = despacharFotosAdministracionPortal_(accion, datos, bloqueo);
  if (respostaFotos !== null) return respostaFotos;

  var erroAutorizacion = autorizarXestionPermisosPortal_(accion, datos);
  if (erroAutorizacion) return erroAutorizacion;

  if (accion === 'listarPermisosPortal') {
    try {
      xestionPermisosInstalarTriggers_();
    } catch (erroTriggerPermisos) {
      console.warn(
        'Permisos: non se puideron verificar os triggers de caché: ' +
        String(erroTriggerPermisos && erroTriggerPermisos.message ? erroTriggerPermisos.message : erroTriggerPermisos)
      );
    }
    return listarPermisosPortalXestion_(datos);
  }

  if (accion === 'obterPermisosUsuarioPortal') return obterPermisosUsuarioPortalXestion_(datos);

  if (accion === 'gardarPermisoPortal') {
    if (bloqueo) bloqueo.waitLock(10000);
    return gardarPermisoPortalXestion_(datos);
  }

  if (accion === 'gardarPermisosPortalLote') {
    if (bloqueo) bloqueo.waitLock(10000);
    return gardarPermisosPortalLoteXestion_(datos);
  }

  if (accion === 'eliminarPermisoPortal') {
    if (bloqueo) bloqueo.waitLock(10000);
    return eliminarPermisoPortalXestion_(datos);
  }

  if (accion === 'rexistrarActividadePortal') return rexistrarActividadePortalXestion_(datos);
  if (accion === 'listarActividadePortal') return listarActividadePortalXestion_(datos);

  /* ───────────────────────────────
   * DOAZÓNS
   * ─────────────────────────────── */

  if (accion === 'listarDoazonsAdministracion') return listarDoazonsAdministracion_(datos);

  if (accion === 'actualizarEstadoDoazonAdministracion') {
    if (bloqueo) bloqueo.waitLock(10000);
    return actualizarEstadoDoazonAdministracion_(datos);
  }

  if (accion === 'eliminarDoazonAdministracion') {
    if (bloqueo) bloqueo.waitLock(10000);
    return eliminarDoazonAdministracion_(datos);
  }

  return null;
}

/*
 * BLOQUE A ENGADIR NO doPost(e) REAL:
 *
 *     const respostaPermisosAdmin =
 *       despacharXestionPermisosPortal_(accion, datos, bloqueo);
 *
 *     if (respostaPermisosAdmin !== null) {
 *       return respostaJSON(respostaPermisosAdmin);
 *     }
 *
 * Colocación recomendada: antes do bloque final que rexistra
 * "Acción non permitida".
 */

var ACCIONS_ESCRITURA_XESTION_PERMISOS_ = [
  'gardarPermisoPortal',
  'gardarPermisosPortalLote',
  'eliminarPermisoPortal',
  'rexistrarActividadePortal',
  'gardarFotoAdministracionPortal',
  'eliminarFotoAdministracionPortal',
  'eliminarFotoHuerfanaAdministracionPortal',

  // Doazóns
  'actualizarEstadoDoazonAdministracion',
  'eliminarDoazonAdministracion'
];

function eAccionEscrituraXestionPermisos_(accion) {
  return ACCIONS_ESCRITURA_XESTION_PERMISOS_.indexOf(
    String(accion || '').trim()
  ) >= 0;
}
