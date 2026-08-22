import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const page=readFileSync(resolve(root,'src/pages/portal/administracion/concertos.astro'),'utf8');
const api=readFileSync(resolve(root,'functions/api/concertos-admin.js'),'utf8');
const gas=readFileSync(resolve(root,'apps-script/concertos-administracion.gs'),'utf8');
describe('administración integral de concertos',()=>{
  it('centraliza alta e edición na administración',()=>{expect(page).toContain('Alta de concerto');expect(api).toContain("accion==='gardarConcerto'");expect(gas).toContain('gardarConcertoAdministracionPortal_');});
  it('reutiliza as relacións de programa e asistencia',()=>{expect(gas).toContain("'ConcertosRepertorio'");expect(gas).toContain("'AsistenciasConcertos'");expect(api).toContain("accion==='gardarPrograma'");expect(api).toContain("accion==='gardarAsistentes'");});
  it('garda cartel e tríptico en R2',()=>{expect(api).toContain("accion==='subirMedio'");expect(api).toContain('env.R2_PRIVADO.put');expect(api).toContain('actualizarMedioConcertoAdministracionPortal');});
  it('non modifica Ensaios',()=>{expect(page).not.toContain('/api/ensaios');});
});
