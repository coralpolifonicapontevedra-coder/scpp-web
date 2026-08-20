/*
 * Integración do módulo Administración → Concertos no despachador principal (Código.gs).
 * Este bloque é idéntico en Preview e Produción. Só cambian as Script Properties.
 * NON crear un segundo doPost.
 *
 * Accións de lectura:
 *   listarConcertosAdministracionPortal
 *   obterXestionConcertoAdministracionPortal
 *
 * Accións de escritura:
 *   actualizarConcertoAdministracionPortal
 *   gardarProgramaConcertoAdministracionPortal
 *   gardarAsistentesConcertoAdministracionPortal
 *   actualizarMedioConcertoAdministracionPortal
 *
 * Exemplo para un dispatcher baseado en if/else:
 *
 *   } else if (accion === 'listarConcertosAdministracionPortal') {
 *     resultado = listarConcertosAdministracionPortal_(datos);
 *   } else if (accion === 'obterXestionConcertoAdministracionPortal') {
 *     resultado = obterXestionConcertoAdministracionPortal_(datos);
 *   } else if (accion === 'actualizarConcertoAdministracionPortal') {
 *     resultado = actualizarConcertoAdministracionPortal_(datos);
 *   } else if (accion === 'gardarProgramaConcertoAdministracionPortal') {
 *     resultado = gardarProgramaConcertoAdministracionPortal_(datos);
 *   } else if (accion === 'gardarAsistentesConcertoAdministracionPortal') {
 *     resultado = gardarAsistentesConcertoAdministracionPortal_(datos);
 *   } else if (accion === 'actualizarMedioConcertoAdministracionPortal') {
 *     resultado = actualizarMedioConcertoAdministracionPortal_(datos);
 *
 * Se Código.gs usa ScriptLock para as escrituras, estas accións deben entrar no bloqueo.
 */
var ACCIONS_ESCRITURA_CONCERTOS_ADMIN_ = [
  'actualizarConcertoAdministracionPortal',
  'gardarProgramaConcertoAdministracionPortal',
  'gardarAsistentesConcertoAdministracionPortal',
  'actualizarMedioConcertoAdministracionPortal'
];
function eAccionEscrituraConcertosAdministracion_(accion){
  return ACCIONS_ESCRITURA_CONCERTOS_ADMIN_.indexOf(String(accion||'').trim())>=0;
}
