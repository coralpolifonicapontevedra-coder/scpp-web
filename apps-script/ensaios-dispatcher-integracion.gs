/*
 * Integración do módulo Ensaios no despachador principal (Código.gs).
 *
 * IMPORTANTE:
 * - Este ficheiro documenta o bloque exacto que debe incorporarse no doPost
 *   da implementación principal de Apps Script.
 * - NON crear un segundo doPost.
 * - As funcións chamadas están definidas en apps-script/ensaios-portal.gs.
 */

/*
 * BLOQUE PARA INCORPORAR NO DESPACHO DE ACCIÓNS DE doPost(e)
 *
 * Se o despachador actual usa unha cadea if/else if, engadir:
 *
 *   } else if (accion === 'listarEnsaiosPortal') {
 *     resultado = listarEnsaiosPortal_(datos);
 *   } else if (accion === 'gardarAsistenciaEnsaioPortal') {
 *     resultado = gardarAsistenciaEnsaioPortal_(datos);
 *   } else if (accion === 'gardarEnsaioRepertorioPortal') {
 *     resultado = gardarEnsaioRepertorioPortal_(datos);
 *   } else if (accion === 'obterSeguimentoEnsaiosPortal') {
 *     resultado = obterSeguimentoEnsaiosPortal_(datos);
 *
 * Se o despachador usa switch(accion), engadir:
 *
 *   case 'listarEnsaiosPortal':
 *     resultado = listarEnsaiosPortal_(datos);
 *     break;
 *   case 'gardarAsistenciaEnsaioPortal':
 *     resultado = gardarAsistenciaEnsaioPortal_(datos);
 *     break;
 *   case 'gardarEnsaioRepertorioPortal':
 *     resultado = gardarEnsaioRepertorioPortal_(datos);
 *     break;
 *   case 'obterSeguimentoEnsaiosPortal':
 *     resultado = obterSeguimentoEnsaiosPortal_(datos);
 *     break;
 */

/*
 * ACCIÓNS DE ESCRITURA
 *
 * Se Código.gs mantén unha lista ou condición de accións que adquiren ScriptLock,
 * deben considerarse de escritura estas dúas:
 *
 *   gardarAsistenciaEnsaioPortal
 *   gardarEnsaioRepertorioPortal
 *
 * As accións listarEnsaiosPortal e obterSeguimentoEnsaiosPortal son só lectura.
 */

var ACCIONS_ESCRITURA_ENSAIOS_PORTAL_ = [
  'gardarAsistenciaEnsaioPortal',
  'gardarEnsaioRepertorioPortal'
];

function eAccionEscrituraEnsaiosPortal_(accion) {
  return ACCIONS_ESCRITURA_ENSAIOS_PORTAL_.indexOf(String(accion || '').trim()) >= 0;
}
