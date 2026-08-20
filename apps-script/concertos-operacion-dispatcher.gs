/*
 * Integración no doPost de Código.gs.
 * Estas accións deben colocarse despois de validar WEB_WRITE_TOKEN e antes
 * da resposta final "Acción non permitida".
 *
 * Non define outro doPost para non duplicar o dispatcher principal.
 */

/*
    if (accion === 'listarConcertoOperacionPortal') {
      try {
        const resultado = listarConcertoOperacionPortal_(datos);
        return respostaJSON(resultado);
      } catch (erroConcertoOperacionLista) {
        return respostaJSON({
          ok:false,
          codigo:'CONCERTO_OPERACION_LIST_EXCEPTION',
          erro:String(erroConcertoOperacionLista && erroConcertoOperacionLista.message ? erroConcertoOperacionLista.message : erroConcertoOperacionLista)
        });
      }
    }

    if (accion === 'gardarAsistenciasConcertoPortal') {
      try {
        bloqueo.waitLock(10000);
        const resultado = gardarAsistenciasConcertoPortal_(datos);
        return respostaJSON(resultado);
      } catch (erroConcertoAsistencias) {
        return respostaJSON({
          ok:false,
          codigo:'CONCERTO_ASISTENCIAS_EXCEPTION',
          erro:String(erroConcertoAsistencias && erroConcertoAsistencias.message ? erroConcertoAsistencias.message : erroConcertoAsistencias)
        });
      }
    }

    if (accion === 'gardarProgramaConcertoPortal') {
      try {
        bloqueo.waitLock(10000);
        const resultado = gardarProgramaConcertoPortal_(datos);
        return respostaJSON(resultado);
      } catch (erroConcertoPrograma) {
        return respostaJSON({
          ok:false,
          codigo:'CONCERTO_PROGRAMA_EXCEPTION',
          erro:String(erroConcertoPrograma && erroConcertoPrograma.message ? erroConcertoPrograma.message : erroConcertoPrograma)
        });
      }
    }
*/
