/*
 * Integración de SincronizacionPartituras no doPost principal.
 * NON crear un segundo doPost.
 *
 * Engadir ao despachador:
 *   listarSincronizacionPartiturasPortal -> listarSincronizacionPartiturasPortal_(datos)
 *   gardarSincronizacionPartiturasPortal -> gardarSincronizacionPartiturasPortal_(datos)
 *   eliminarSincronizacionPartiturasPortal -> eliminarSincronizacionPartiturasPortal_(datos)
 *
 * gardar/eliminar son accións de escritura e deben executarse baixo o mesmo ScriptLock
 * ca o resto de operacións administrativas.
 */

var ACCIONS_ESCRITURA_SINCRONIZACION_ = [
  'gardarSincronizacionPartiturasPortal',
  'eliminarSincronizacionPartiturasPortal'
];

function eAccionEscrituraSincronizacion_(accion) {
  return ACCIONS_ESCRITURA_SINCRONIZACION_.indexOf(String(accion || '').trim()) >= 0;
}
