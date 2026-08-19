/*
 * Integración do módulo Ensaios no despachador principal (Código.gs).
 *
 * IMPORTANTE:
 * - Este ficheiro documenta o bloque exacto que debe incorporarse no doPost
 *   da implementación principal de Apps Script.
 * - NON crear un segundo doPost.
 * - As funcións chamadas están definidas en apps-script/ensaios-portal.gs,
 *   apps-script/ensaios-alta.gs e apps-script/ensaios-administracion.gs.
 */

/*
 * BLOQUE PARA INCORPORAR NO DESPACHO DE ACCIÓNS DE doPost(e)
 *
 * Se o despachador actual usa unha cadea if/else if, engadir:
 *
 *   } else if (accion === 'listarEnsaiosPortal') {
 *     resultado = listarEnsaiosPortal_(datos);
 *   } else if (accion === 'gardarEnsaioPortal') {
 *     resultado = gardarEnsaioPortal_(datos);
 *   } else if (accion === 'gardarAsistenciaEnsaioPortal') {
 *     resultado = gardarAsistenciaEnsaioPortal_(datos);
 *   } else if (accion === 'gardarEnsaioRepertorioPortal') {
 *     resultado = gardarEnsaioRepertorioPortal_(datos);
 *   } else if (accion === 'obterSeguimentoEnsaiosPortal') {
 *     resultado = obterSeguimentoEnsaiosPortal_(datos);
 *   } else if (accion === 'listarEnsaiosAdministracionPortal') {
 *     resultado = listarEnsaiosAdministracionPortal_(datos);
 *   } else if (accion === 'actualizarEnsaioAdministracionPortal') {
 *     resultado = actualizarEnsaioAdministracionPortal_(datos);
 *
 * Se o despachador usa switch(accion), engadir os casos equivalentes.
 */

/*
 * ACCIÓNS DE ESCRITURA
 *
 * Se Código.gs mantén unha lista ou condición de accións que adquiren ScriptLock,
 * deben considerarse de escritura estas catro:
 *
 *   gardarEnsaioPortal
 *   gardarAsistenciaEnsaioPortal
 *   gardarEnsaioRepertorioPortal
 *   actualizarEnsaioAdministracionPortal
 *
 * As accións listarEnsaiosPortal, obterSeguimentoEnsaiosPortal e
 * listarEnsaiosAdministracionPortal son só lectura.
 */

var ACCIONS_ESCRITURA_ENSAIOS_PORTAL_ = [
  'gardarEnsaioPortal',
  'gardarAsistenciaEnsaioPortal',
  'gardarEnsaioRepertorioPortal',
  'actualizarEnsaioAdministracionPortal'
];

function eAccionEscrituraEnsaiosPortal_(accion) {
  return ACCIONS_ESCRITURA_ENSAIOS_PORTAL_.indexOf(String(accion || '').trim()) >= 0;
}
