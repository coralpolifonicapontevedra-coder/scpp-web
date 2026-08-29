/* Integración no doPost principal de SCPP Script - Pruebas.
 * NON crear un segundo doPost.
 *
 * Inserir estes bloques antes do rexistro final de "Acción non permitida".
 * O token xa se valida ao inicio do doPost actual.
 * A API /api/permisos valida ademais Firebase e nivel de Administración.
 */

function despacharXestionPermisosPortal_(accion, datos, bloqueo) {
  accion = String(accion || '').trim();

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
 * Colocación recomendada: despois dos dispatchers/módulos de Administración
 * e antes do bloque final que rexistra "Acción non permitida".
 */

var ACCIONS_ESCRITURA_XESTION_PERMISOS_ = [
  'gardarPermisoPortal',
  'eliminarPermisoPortal',
  'rexistrarActividadePortal'
];

function eAccionEscrituraXestionPermisos_(accion) {
  return ACCIONS_ESCRITURA_XESTION_PERMISOS_.indexOf(
    String(accion || '').trim()
  ) >= 0;
}
