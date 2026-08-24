import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(resolve(root, 'src/pages/portal/administracion/concertos.astro'), 'utf8');
const api = readFileSync(resolve(root, 'functions/api/concertos-admin.js'), 'utf8');
const gas = readFileSync(resolve(root, 'apps-script/concertos-administracion.gs'), 'utf8');
const attendanceApi = readFileSync(resolve(root, 'functions/api/asistencias-concertos.js'), 'utf8');
const attendanceGas = readFileSync(resolve(root, 'apps-script/canonical-2026-08-03/asistencias-concertos.gs'), 'utf8');

const expectAction = (source: string, action: string) => {
  expect(source).toMatch(new RegExp(`accion\\s*===\\s*['\"]${action}['\"]`));
};

describe('administración integral de concertos', () => {
  it('centraliza alta e edición na administración', () => {
    expect(page).toContain('Alta de concerto');
    expectAction(api, 'gardarConcerto');
    expect(gas).toContain('gardarConcertoAdministracionPortal_');
  });

  it('reutiliza as relacións de programa e asistencia', () => {
    expect(gas).toContain("'ConcertosRepertorio'");
    expect(gas).toContain("'AsistenciasConcertos'");
    expectAction(api, 'gardarPrograma');
    expectAction(api, 'gardarAsistentes');
  });

  it('rexistra os tres estados de asistencia e admite columnas históricas ou novas', () => {
    expect(page).toContain('data-attendance="asiste"');
    expect(page).toContain('data-attendance="non_asiste"');
    expect(page).toContain('data-attendance="xustificada"');
    expect(gas.includes('Observaciones') || gas.includes('EstadoAsistencia')).toBe(true);
    expect(gas).toMatch(/estado|EstadoAsistencia/);
  });

  it('usa un borrador R2 illado e só sincroniza ao finalizar', () => {
    expect(api).toContain('concertos/borradores-v1/');
    expectAction(api, 'finalizarXestion');
    expect(api).toContain('indices/preview/concertos-privado-v1.json');
    expect(page).toContain('Finalizar e sincronizar coa Sheet');
  });

  it('preserva a páxina Concertos e exclúe ausencias do seu índice', () => {
    expect(api).toContain('attendeeList(draft)');
    expect(api).toContain('result.asistenciasPorConcerto || {}');
    expect(attendanceApi).toContain('indices/preview/asistencias-concertos.json');
    expect(attendanceGas).toContain('EstadoAsistencia');
    expect(attendanceGas).toContain("['asiste', 'true', '1', 'si', 'sí', 'yes', 'x']");
  });

  it('garda cartel e tríptico en R2 e sincronízaos coa Sheet ao finalizar', () => {
    expectAction(api, 'subirMedio');
    expect(api).toContain('env.R2_PRIVADO.put');
    expect(api).toContain('updateConcertMetadataIndex(env, idConcerto, { [tipo]: ruta })');
    expect(api).toContain('sheetSincronizada: false');
    expect(api).toContain("'actualizarConcertoAdministracionPortal'");
    expect(api).toContain('...medios');
  });

  it('non modifica Ensaios', () => {
    expect(page).not.toContain('/api/ensaios');
  });
});
