/*
 * Dispatcher modular de Administración.
 * Restaurado en Preview porque Código.js o invoca antes do resto de accións.
 * Mantén Concertos e incorpora Repertorio sen crear un segundo doPost.
 */
var ACCIONS_CONCERTOS_ADMIN_ = [
  'listarConcertosAdministracionPortal',
  'obterXestionConcertoAdministracionPortal',
  'crearConcertoAdministracionPortal',
  'eliminarConcertoAdministracionPortal',
  'actualizarConcertoAdministracionPortal',
  'gardarProgramaConcertoAdministracionPortal',
  'gardarAsistentesConcertoAdministracionPortal',
  'actualizarMedioConcertoAdministracionPortal'
];

var ACCIONS_REPERTORIO_ADMIN_ = [
  'listarRepertorioAdministracion',
  'diagnosticoRepertorioAdministracion',
  'altaObraRepertorioAdministracion',
  'altaAudioRepertorioAdministracion',
  'estadoRecursoRepertorioAdministracion',
  'actualizarObraRepertorioAdministracion',
  'actualizarPartituraRepertorioAdministracion',
  'actualizarAudioRepertorioAdministracion'
];

var ACCIONS_ESCRITURA_ADMIN_ = [
  'crearConcertoAdministracionPortal',
  'eliminarConcertoAdministracionPortal',
  'actualizarConcertoAdministracionPortal',
  'gardarProgramaConcertoAdministracionPortal',
  'gardarAsistentesConcertoAdministracionPortal',
  'actualizarMedioConcertoAdministracionPortal',
  'altaObraRepertorioAdministracion',
  'altaAudioRepertorioAdministracion',
  'estadoRecursoRepertorioAdministracion',
  'actualizarObraRepertorioAdministracion',
  'actualizarPartituraRepertorioAdministracion',
  'actualizarAudioRepertorioAdministracion'
];

function eAccionConcertosAdministracion_(accion) {
  accion = String(accion || '').trim();
  return ACCIONS_CONCERTOS_ADMIN_.indexOf(accion) >= 0 || ACCIONS_REPERTORIO_ADMIN_.indexOf(accion) >= 0;
}

function eAccionEscrituraConcertosAdministracion_(accion) {
  return ACCIONS_ESCRITURA_ADMIN_.indexOf(String(accion || '').trim()) >= 0;
}

function despacharConcertosAdministracion_(accion, datos, bloqueo) {
  accion = String(accion || '').trim();
  if (!eAccionConcertosAdministracion_(accion)) return null;

  if (eAccionEscrituraConcertosAdministracion_(accion) && bloqueo && !bloqueo.hasLock()) {
    bloqueo.waitLock(10000);
  }

  if (accion === 'listarRepertorioAdministracion') return listarRepertorioAdministracion_();
  if (accion === 'diagnosticoRepertorioAdministracion') return diagnosticoRepertorioAdministracion_();
  if (accion === 'altaObraRepertorioAdministracion') return altaObraRepertorioAdministracion_(datos);
  if (accion === 'altaAudioRepertorioAdministracion') return altaAudioRepertorioAdministracion_(datos);
  if (accion === 'estadoRecursoRepertorioAdministracion') return estadoRecursoRepertorioAdministracion_(datos);
  if (accion === 'actualizarObraRepertorioAdministracion') return actualizarObraRepertorioAdministracion_(datos);
  if (accion === 'actualizarPartituraRepertorioAdministracion') return actualizarPartituraRepertorioAdministracion_(datos);
  if (accion === 'actualizarAudioRepertorioAdministracion') return actualizarAudioRepertorioAdministracion_(datos);

  if (accion === 'listarConcertosAdministracionPortal') return listarConcertosAdministracionPortal_(datos);
  if (accion === 'obterXestionConcertoAdministracionPortal') return obterXestionConcertoAdministracionPortal_(datos);
  if (accion === 'actualizarConcertoAdministracionPortal') return actualizarConcertoAdministracionPortal_(datos);
  if (accion === 'gardarProgramaConcertoAdministracionPortal') return gardarProgramaConcertoAdministracionPortal_(datos);
  if (accion === 'gardarAsistentesConcertoAdministracionPortal') return gardarAsistentesConcertoAdministracionPortal_(datos);
  if (accion === 'actualizarMedioConcertoAdministracionPortal') return actualizarMedioConcertoAdministracionPortal_(datos);

  if (accion === 'crearConcertoAdministracionPortal') {
    if (typeof crearConcertoAdministracionPortal_ !== 'function') return { ok:false, codigo:'NOT_IMPLEMENTED', erro:'A alta de concertos aínda non está integrada no paquete canónico' };
    return crearConcertoAdministracionPortal_(datos);
  }
  if (accion === 'eliminarConcertoAdministracionPortal') {
    if (typeof eliminarConcertoAdministracionPortal_ !== 'function') return { ok:false, codigo:'NOT_IMPLEMENTED', erro:'A baixa de concertos aínda non está integrada no paquete canónico' };
    return eliminarConcertoAdministracionPortal_(datos);
  }

  return null;
}
