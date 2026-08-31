/*
 * Integración do módulo Partituras no doPost principal de Código.gs.
 * NON crear un segundo doPost.
 * As funcións están en apps-script/partituras-portal.gs.
 */

/*
 * Engadir ao despachador de accións:
 *
 *   } else if (accion === 'altaPartituraPortal') {
 *     resultado = altaPartituraPortal_(datos);
 *   } else if (accion === 'eliminarPartituraPortal') {
 *     resultado = eliminarPartituraPortal_(datos);
 *
 * Ou, se usa switch:
 *
 *   case 'altaPartituraPortal':
 *     resultado = altaPartituraPortal_(datos);
 *     break;
 *   case 'eliminarPartituraPortal':
 *     resultado = eliminarPartituraPortal_(datos);
 *     break;
 *
 * As dúas accións son de ESCRITURA e deben entrar no mesmo ScriptLock que
 * o resto de altas, modificacións e eliminacións do portal.
 */

var ACCIONS_ESCRITURA_PARTITURAS_PORTAL_ = [
  'altaPartituraPortal',
  'eliminarPartituraPortal'
];

function eAccionEscrituraPartiturasPortal_(accion) {
  return ACCIONS_ESCRITURA_PARTITURAS_PORTAL_.indexOf(String(accion || '').trim()) >= 0;
}
