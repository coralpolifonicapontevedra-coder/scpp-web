/*
 * Integración de Administración → Concertos co dispatcher principal.
 * Código común para Preview e Produción: só cambia a configuración do ambiente.
 * NON define un segundo doPost.
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

var ACCIONS_ESCRITURA_CONCERTOS_ADMIN_ = [
  'crearConcertoAdministracionPortal',
  'eliminarConcertoAdministracionPortal',
  'actualizarConcertoAdministracionPortal',
  'gardarProgramaConcertoAdministracionPortal',
  'gardarAsistentesConcertoAdministracionPortal',
  'actualizarMedioConcertoAdministracionPortal'
];

function eAccionConcertosAdministracion_(accion) {
  return ACCIONS_CONCERTOS_ADMIN_.indexOf(String(accion || '').trim()) >= 0;
}

function eAccionEscrituraConcertosAdministracion_(accion) {
  return ACCIONS_ESCRITURA_CONCERTOS_ADMIN_.indexOf(String(accion || '').trim()) >= 0;
}

function despacharConcertosAdministracion_(accion, datos, bloqueo) {
  accion = String(accion || '').trim();

  /*
   * Código.js xa chama este dispatcher de forma incondicional antes do
   * rexeitamento final. Aproveitamos ese punto común para encamiñar tamén
   * Xestión de permisos / Auditoría, cuxo dispatcher modular existe no
   * paquete de Preview pero aínda non está chamado directamente polo doPost.
   *
   * Para accións alleas a ambos os módulos, o dispatcher de permisos devolve
   * null e o fluxo normal de Código.js continúa sen cambios.
   */
  if (!eAccionConcertosAdministracion_(accion)) {
    if (typeof despacharXestionPermisosPortal_ === 'function') {
      var respostaXestionPermisos =
        despacharXestionPermisosPortal_(accion, datos, bloqueo);

      if (respostaXestionPermisos !== null) {
        return respostaXestionPermisos;
      }
    }
    return null;
  }

  if (
    eAccionEscrituraConcertosAdministracion_(accion) &&
    bloqueo &&
    !bloqueo.hasLock()
  ) {
    bloqueo.waitLock(10000);
  }

  if (accion === 'listarConcertosAdministracionPortal') {
    return listarConcertosAdministracionPortal_(datos);
  }
  if (accion === 'obterXestionConcertoAdministracionPortal') {
    return obterXestionConcertoAdministracionPortal_(datos);
  }
  if (accion === 'actualizarConcertoAdministracionPortal') {
    return actualizarConcertoAdministracionPortal_(datos);
  }
  if (accion === 'gardarProgramaConcertoAdministracionPortal') {
    return gardarProgramaConcertoAdministracionPortal_(datos);
  }
  if (accion === 'gardarAsistentesConcertoAdministracionPortal') {
    return gardarAsistentesConcertoAdministracionPortal_(datos);
  }
  if (accion === 'actualizarMedioConcertoAdministracionPortal') {
    return actualizarMedioConcertoAdministracionPortal_(datos);
  }

  /*
   * Estas dúas accións mantéñense no contrato do módulo porque a alta e a
   * baixa pertencen a Administración. Se a implementación aínda non está
   * presente no paquete actual, devolvemos un erro explícito e non rompemos
   * o resto do dispatcher.
   */
  if (accion === 'crearConcertoAdministracionPortal') {
    if (typeof crearConcertoAdministracionPortal_ !== 'function') {
      return { ok: false, codigo: 'NOT_IMPLEMENTED', erro: 'A alta de concertos aínda non está integrada no paquete canónico' };
    }
    return crearConcertoAdministracionPortal_(datos);
  }
  if (accion === 'eliminarConcertoAdministracionPortal') {
    if (typeof eliminarConcertoAdministracionPortal_ !== 'function') {
      return { ok: false, codigo: 'NOT_IMPLEMENTED', erro: 'A baixa de concertos aínda non está integrada no paquete canónico' };
    }
    return eliminarConcertoAdministracionPortal_(datos);
  }

  return null;
}
