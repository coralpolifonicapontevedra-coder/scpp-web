import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const page=readFileSync(resolve(root,'src/pages/portal/administracion/concertos.astro'),'utf8');
const api=readFileSync(resolve(root,'functions/api/concertos-admin.js'),'utf8');
const gas=readFileSync(resolve(root,'apps-script/concertos-administracion.gs'),'utf8');
const attendanceApi=readFileSync(resolve(root,'functions/api/asistencias-concertos.js'),'utf8');
const attendanceGas=readFileSync(resolve(root,'apps-script/canonical-2026-08-03/asistencias-concertos.gs'),'utf8');
describe('administración integral de concertos',()=>{
  it('centraliza alta e edición na administración',()=>{expect(page).toContain('Alta de concerto');expect(api).toContain("accion==='gardarConcerto'");expect(gas).toContain('gardarConcertoAdministracionPortal_');});
  it('reutiliza as relacións de programa e asistencia',()=>{expect(gas).toContain("'ConcertosRepertorio'");expect(gas).toContain("'AsistenciasConcertos'");expect(api).toContain("accion==='gardarPrograma'");expect(api).toContain("accion==='gardarAsistentes'");});
<<<<<<< HEAD
  it('rexistra os tres estados de asistencia e reutiliza Observaciones como respaldo',()=>{expect(page).toContain('data-attendance="asiste"');expect(page).toContain('data-attendance="non_asiste"');expect(page).toContain('data-attendance="xustificada"');expect(gas).toContain("'Observaciones'");expect(gas).toContain("estado==='asiste'");});
  it('usa un borrador R2 illado e só sincroniza ao finalizar',()=>{expect(api).toContain('concertos/borradores-v1/');expect(api).toContain("accion==='finalizarXestion'");expect(api).toContain('indices/preview/concertos-privado-v1.json');expect(page).toContain('Finalizar e sincronizar coa Sheet');});
  it('preserva a páxina Concertos e exclúe ausencias do seu índice',()=>{expect(api).toContain("[draft.idConcerto]:attendeeList(draft)");expect(api).toContain("{...(result.asistenciasPorConcerto||{})");expect(attendanceApi).toContain('indices/preview/asistencias-concertos.json');expect(attendanceGas).toContain("!['asiste', 'true', '1', 'si', 'sí', 'yes', 'x'].includes(estado)");});
=======
  it('rexistra os tres estados de asistencia e usa os nomes reais da folla',()=>{expect(page).toContain('data-attendance="asiste"');expect(page).toContain('data-attendance="non_asiste"');expect(page).toContain('data-attendance="xustificada"');expect(gas).toContain("'EstadoAsistencia'");expect(gas).toContain("if(h==='Persoa')");});
  it('usa un borrador R2 illado e só sincroniza ao finalizar',()=>{expect(api).toContain('concertos/borradores-v1/');expect(api).toContain("accion==='finalizarXestion'");expect(api).toContain('indices/preview/concertos-privado-v1.json');expect(page).toContain('Finalizar e sincronizar coa Sheet');});
  it('preserva a páxina Concertos e exclúe ausencias do seu índice',()=>{expect(api).toContain("[draft.idConcerto]:attendeeList(draft)");expect(api).toContain("{...(result.asistenciasPorConcerto||{})");expect(attendanceApi).toContain('indices/preview/asistencias-concertos.json');expect(attendanceGas).toContain("estadoAsistencia && estadoAsistencia !== 'asiste'");});
>>>>>>> 9616a436ec718f3ffa0b98eb235ff3a85531fc75
  it('garda cartel e tríptico en R2',()=>{expect(api).toContain("accion==='subirMedio'");expect(api).toContain('env.R2_PRIVADO.put');expect(api).toContain('actualizarMedioConcertoAdministracionPortal');});
  it('non modifica Ensaios',()=>{expect(page).not.toContain('/api/ensaios');});
});
