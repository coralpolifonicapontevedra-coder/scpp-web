/* Integración no doPost principal de SCPP Script - Pruebas.
 * NON crear un segundo doPost.
 *
 * O token xa se valida ao inicio do doPost actual. Persoas V2 aplica ademais
 * os niveis específicos do módulo Persoas en PermisosPortal.
 */

var ACCIONS_ADMIN_XESTION_PERMISOS_ = [
  'listarPermisosPortal',
  'gardarPermisoPortal',
  'gardarPermisosPortalLote',
  'eliminarPermisoPortal',
  'rexistrarActividadePortal',
  'listarActividadePortal',
  'listarDoazonsAdministracion',
  'actualizarEstadoDoazonAdministracion',
  'eliminarDoazonAdministracion'
];

var ACCIONS_PERSOAS_ADMIN_PORTAL_ = [
  /* Fluxo legacy: mantense para revisións e compatibilidade. */
  'crearPersoaAdministracion',
  'actualizarPersoaAdministracion',
  'cambiarEstadoPersoaAdministracion',
  'enviarRevisionsPersoasAdministracion',

  /* Administración → Persoas V2. */
  'persoasV2Listar',
  'persoasV2SyncListar',
  'persoasV2Version',
  'persoasV2Crear',
  'persoasV2Actualizar',
  'persoasV2Estado',
  'persoasV2Eliminar',
  'persoasV2InstalarTrigger'
];

function despacharPersoasAdministracionPortal_(accion, datos) {
  if (ACCIONS_PERSOAS_ADMIN_PORTAL_.indexOf(accion) < 0) return null;

  if (accion === 'crearPersoaAdministracion') return crearPersoaAdministracion_(datos);
  if (accion === 'actualizarPersoaAdministracion') return actualizarPersoaAdministracion_(datos);
  if (accion === 'cambiarEstadoPersoaAdministracion') return cambiarEstadoPersoaAdministracion_(datos);
  if (accion === 'enviarRevisionsPersoasAdministracion') return enviarRevisionsPersoasAdministracion_(datos);

  if (accion === 'persoasV2Listar') return persoasV2Listar_(datos);
  if (accion === 'persoasV2SyncListar') return persoasV2SyncListar_(datos);
  if (accion === 'persoasV2Version') return persoasV2Version_(datos);
  if (accion === 'persoasV2Crear') return persoasV2Crear_(datos);
  if (accion === 'persoasV2Actualizar') return persoasV2Actualizar_(datos);
  if (accion === 'persoasV2Estado') return persoasV2Estado_(datos);
  if (accion === 'persoasV2Eliminar') return persoasV2Eliminar_(datos);
  if (accion === 'persoasV2InstalarTrigger') return persoasV2InstalarTrigger_(datos);

  return null;
}

function autorizarXestionPermisosPortal_(accion, datos) {
  if (ACCIONS_ADMIN_XESTION_PERMISOS_.indexOf(accion) < 0) return null;

  var correo = String(datos && (datos.actorEmail || datos.email) || '').trim().toLowerCase();
  if (!correo) {
    return { ok:false, codigo:'ADMIN_REQUIRED', erro:'Non se puido identificar a conta administradora.' };
  }

  var permiso = resolverPermisosPortal_(correo);
  if (!permiso || permiso.escritura !== true) {
    return { ok:false, codigo:'ADMIN_REQUIRED', erro:'A túa conta non ten permisos de administración para esta operación.' };
  }
  return null;
}

function despacharXestionPermisosPortal_(accion, datos, bloqueo) {
  accion = String(accion || '').trim();

  var respostaPersoas = despacharPersoasAdministracionPortal_(accion, datos);
  if (respostaPersoas !== null) {
    rexistrarAcceso({
      email:String(datos && datos.email || '').trim().toLowerCase(),
      tipoEvento:accion.indexOf('persoasV2') === 0 ? 'Persoas V2 · ' + accion : (
        accion === 'crearPersoaAdministracion' ? 'Crear persoa' : (
          accion === 'actualizarPersoaAdministracion' ? 'Actualizar persoa' : (
            accion === 'cambiarEstadoPersoaAdministracion'
              ? (respostaPersoas.activo ? 'Reactivar persoa' : 'Dar de baixa persoa')
              : 'Envío masivo de revisións'
          )
        )
      ),
      modulo:'Administración · Persoas',
      resultado:respostaPersoas.ok ? 'Correcto' : 'Rexeitado',
      detalle:respostaPersoas.ok
        ? String(respostaPersoas.idPersoa || respostaPersoas.enviados || respostaPersoas.version || '')
        : String(respostaPersoas.erro || '')
    });
    return respostaPersoas;
  }

  var erroAutorizacion = autorizarXestionPermisosPortal_(accion, datos);
  if (erroAutorizacion) return erroAutorizacion;

  if (accion === 'listarPermisosPortal') return listarPermisosPortalXestion_(datos);
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

var ACCIONS_ESCRITURA_XESTION_PERMISOS_ = [
  'gardarPermisoPortal',
  'gardarPermisosPortalLote',
  'eliminarPermisoPortal',
  'rexistrarActividadePortal',
  'actualizarEstadoDoazonAdministracion',
  'eliminarDoazonAdministracion'
];

function eAccionEscrituraXestionPermisos_(accion) {
  return ACCIONS_ESCRITURA_XESTION_PERMISOS_.indexOf(String(accion || '').trim()) >= 0;
}
