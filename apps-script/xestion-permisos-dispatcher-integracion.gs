/*
 * Integración de Xestión de permisos no doPost principal.
 * NON crear un segundo doPost.
 *
 * Engadir ao despachador:
 *
 *   } else if (accion === 'listarPermisosPortal') {
 *     resultado = listarPermisosPortalXestion_(datos);
 *   } else if (accion === 'obterPermisosUsuarioPortal') {
 *     resultado = obterPermisosUsuarioPortalXestion_(datos);
 *   } else if (accion === 'gardarPermisoPortal') {
 *     resultado = gardarPermisoPortalXestion_(datos);
 *   } else if (accion === 'eliminarPermisoPortal') {
 *     resultado = eliminarPermisoPortalXestion_(datos);
 *   } else if (accion === 'rexistrarActividadePortal') {
 *     resultado = rexistrarActividadePortalXestion_(datos);
 *   } else if (accion === 'listarActividadePortal') {
 *     resultado = listarActividadePortalXestion_(datos);
 *
 * Escritura: gardarPermisoPortal, eliminarPermisoPortal, rexistrarActividadePortal.
 */

var ACCIONS_ESCRITURA_XESTION_PERMISOS_ = [
  'gardarPermisoPortal',
  'eliminarPermisoPortal',
  'rexistrarActividadePortal'
];

function eAccionEscrituraXestionPermisos_(accion) {
  return ACCIONS_ESCRITURA_XESTION_PERMISOS_.indexOf(String(accion || '').trim()) >= 0;
}
