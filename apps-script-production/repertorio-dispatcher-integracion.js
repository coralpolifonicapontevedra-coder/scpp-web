/* Dispatcher exclusivo de Administración → Repertorio en Producción. */
var ACCIONS_REPERTORIO_ADMIN_PROD_ = [
  'listarRepertorioAdministracion',
  'diagnosticoRepertorioAdministracion',
  'altaObraRepertorioAdministracion',
  'altaAudioRepertorioAdministracion',
  'estadoRecursoRepertorioAdministracion',
  'actualizarObraRepertorioAdministracion',
  'actualizarPartituraRepertorioAdministracion',
  'actualizarAudioRepertorioAdministracion',
  'eliminarRecursoRepertorioAdministracion'
];

var ACCIONS_REPERTORIO_ESCRITURA_PROD_ = [
  'altaObraRepertorioAdministracion',
  'altaAudioRepertorioAdministracion',
  'estadoRecursoRepertorioAdministracion',
  'actualizarObraRepertorioAdministracion',
  'actualizarPartituraRepertorioAdministracion',
  'actualizarAudioRepertorioAdministracion',
  'eliminarRecursoRepertorioAdministracion'
];

function eAccionRepertorioAdministracionProduccion_(accion) {
  return ACCIONS_REPERTORIO_ADMIN_PROD_.indexOf(String(accion || '').trim()) >= 0;
}

function eAccionEscrituraRepertorioAdministracionProduccion_(accion) {
  return ACCIONS_REPERTORIO_ESCRITURA_PROD_.indexOf(String(accion || '').trim()) >= 0;
}

function despacharRepertorioAdministracionProduccion_(accion, datos, bloqueo) {
  accion = String(accion || '').trim();
  if (!eAccionRepertorioAdministracionProduccion_(accion)) return null;

  if (
    eAccionEscrituraRepertorioAdministracionProduccion_(accion) &&
    bloqueo &&
    !bloqueo.hasLock()
  ) {
    bloqueo.waitLock(10000);
  }

  if (accion === 'listarRepertorioAdministracion') return listarRepertorioAdministracion_();
  if (accion === 'diagnosticoRepertorioAdministracion') return diagnosticoRepertorioAdministracion_();
  if (accion === 'altaObraRepertorioAdministracion') return altaObraRepertorioAdministracionSegura_(datos);
  if (accion === 'altaAudioRepertorioAdministracion') return altaAudioRepertorioAdministracion_(datos);
  if (accion === 'estadoRecursoRepertorioAdministracion') return estadoRecursoRepertorioAdministracion_(datos);
  if (accion === 'actualizarObraRepertorioAdministracion') return actualizarObraRepertorioAdministracion_(datos);
  if (accion === 'actualizarPartituraRepertorioAdministracion') return actualizarPartituraRepertorioAdministracion_(datos);
  if (accion === 'actualizarAudioRepertorioAdministracion') return actualizarAudioRepertorioAdministracion_(datos);
  if (accion === 'eliminarRecursoRepertorioAdministracion') return eliminarRecursoRepertorioAdministracion_(datos);

  return null;
}
