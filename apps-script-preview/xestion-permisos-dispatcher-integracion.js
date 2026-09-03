/* Integración no doPost principal de SCPP Script - Pruebas.
 * NON crear un segundo doPost.
 *
 * Inserir estes bloques antes do rexistro final de "Acción non permitida".
 * O token xa se valida ao inicio do doPost actual.
 * A identidade chega validada por Firebase desde /api/permisos e as accións
 * administrativas volven comprobar aquí o permiso real mediante
 * resolverPermisosPortal_().
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
  'crearPersoaInvitacionAdministracion',
  'listarEstadosAltaPersoasAdministracion',
  'actualizarPersoaAdministracion',
  'completarAltaPersoaAdministracion',
  'cambiarEstadoPersoaAdministracion',
  'enviarRevisionsPersoasAdministracion'
];

function despacharPersoasAdministracionPortal_(accion, datos) {
  if (ACCIONS_PERSOAS_ADMIN_PORTAL_.indexOf(accion) < 0) {
    return null;
  }

  if (accion === 'crearPersoaAdministracion') {
    return crearPersoaAdministracion_(datos);
  }

  if (accion === 'crearPersoaInvitacionAdministracion') {
    return crearPersoaInvitacionAdministracion_(datos);
  }

  if (accion === 'listarEstadosAltaPersoasAdministracion') {
    return listarEstadosAltaPersoasAdministracion_(datos);
  }

  if (accion === 'actualizarPersoaAdministracion') {
    return actualizarPersoaAdministracion_(datos);
  }

  if (accion === 'completarAltaPersoaAdministracion') {
    return completarAltaPersoaAdministracion_(datos);
  }

  if (accion === 'cambiarEstadoPersoaAdministracion') {
    return cambiarEstadoPersoaAdministracion_(datos);
  }

  if (accion === 'enviarRevisionsPersoasAdministracion') {
    return enviarRevisionsPersoasAdministracion_(datos);
  }

  return null;
}

function autorizarXestionPermisosPortal_(accion, datos) {
  if (ACCIONS_ADMIN_XESTION_PERMISOS_.indexOf(accion) < 0) {
    return null;
  }

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
      erro:
        'A túa conta non ten permisos de administración para esta operación.'
    };
  }

  return null;
}

function despacharXestionPermisosPortal_(accion, datos, bloqueo) {
  accion = String(accion || '').trim();

  var respostaPersoas =
    despacharPersoasAdministracionPortal_(accion, datos);

  if (respostaPersoas !== null) {
    rexistrarAcceso({
      email: String(
        datos && datos.email || ''
      ).trim().toLowerCase(),

      tipoEvento:
        accion === 'crearPersoaAdministracion'
          ? 'Crear persoa'
          : (
            accion === 'crearPersoaInvitacionAdministracion'
              ? 'Crear alta por invitación'
              : (
                accion === 'listarEstadosAltaPersoasAdministracion'
                  ? 'Consultar estados de alta'
                  : (
                    accion === 'actualizarPersoaAdministracion'
                      ? 'Actualizar persoa'
                      : (
                        accion === 'completarAltaPersoaAdministracion'
                          ? 'Completar alta por invitación'
                          : (
                            accion === 'cambiarEstadoPersoaAdministracion'
                              ? (
                                respostaPersoas.activo
                                  ? 'Reactivar persoa'
                                  : 'Dar de baixa persoa'
                              )
                              : 'Envío masivo de revisións'
                          )
                      )
                  )
              )
          ),

      modulo: 'Administración · Persoas',

      resultado:
        respostaPersoas.ok
          ? 'Correcto'
          : 'Rexeitado',

      detalle:
        respostaPersoas.ok
          ? String(
              respostaPersoas.idPersoa ||
              respostaPersoas.enviados ||
              ''
            )
          : String(respostaPersoas.erro || '')
    });

    return respostaPersoas;
  }

  var erroAutorizacion =
    autorizarXestionPermisosPortal_(accion, datos);

  if (erroAutorizacion) {
    return erroAutorizacion;
  }

  if (accion === 'listarPermisosPortal') {
    return listarPermisosPortalXestion_(datos);
  }

  if (accion === 'obterPermisosUsuarioPortal') {
    return obterPermisosUsuarioPortalXestion_(datos);
  }

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

  if (accion === 'rexistrarActividadePortal') {
    return rexistrarActividadePortalXestion_(datos);
  }

  if (accion === 'listarActividadePortal') {
    return listarActividadePortalXestion_(datos);
  }

  /* ───────────────────────────────
   * DOAZÓNS
   * ─────────────────────────────── */

  if (accion === 'listarDoazonsAdministracion') {
    return listarDoazonsAdministracion_(datos);
  }

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
 *       despacharXestionPermisosPortal_(
 *         accion,
 *         datos,
 *         bloqueo
 *       );
 *
 *     if (respostaPermisosAdmin !== null) {
 *       return respostaJSON(respostaPermisosAdmin);
 *     }
 *
 * Colocación recomendada: despois dos dispatchers/módulos
 * de Administración e antes do bloque final que rexistra
 * "Acción non permitida".
 */

var ACCIONS_ESCRITURA_XESTION_PERMISOS_ = [
  'gardarPermisoPortal',
  'gardarPermisosPortalLote',
  'eliminarPermisoPortal',
  'rexistrarActividadePortal',

  // Doazóns
  'actualizarEstadoDoazonAdministracion',
  'eliminarDoazonAdministracion'
];

function eAccionEscrituraXestionPermisos_(accion) {
  return ACCIONS_ESCRITURA_XESTION_PERMISOS_.indexOf(
    String(accion || '').trim()
  ) >= 0;
}
