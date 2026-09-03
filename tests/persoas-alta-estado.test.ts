import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const web = readFileSync('public/js/persoas-revision-photo.js', 'utf8');
const completarApi = readFileSync('functions/api/persoas-alta-completar.js', 'utf8');
const invitacionAppsScript = readFileSync('apps-script-preview/persoas-alta-invitacion.js', 'utf8');
const invitacionWeb = readFileSync('public/js/persoas-alta-invitacion.js', 'utf8');

describe('Persoas · estado de alta por invitación', () => {
  it('crea a alta como PENDENTE e móstraa na administración', () => {
    expect(invitacionAppsScript).toContain("poñerValorPersoaAdmin_(fila, indices, 'EstadoAlta', 'PENDENTE')");
    expect(invitacionWeb).toContain("estadoAlta: 'PENDENTE'");
    expect(invitacionWeb).toContain('Pendente de completar ficha');
  });

  it('só completa EstadoAlta despois de gardar correctamente a revisión', () => {
    expect(web).toContain("body?.accion === 'gardarRevision'");
    expect(web).toContain("saved?.ok === true");
    expect(web).toContain("'/api/persoas-alta-completar'");
    expect(completarApi).toContain("invitation.estado !== 'COMPLETADA'");
    expect(completarApi).toContain("accion: 'completarAltaPersoaAdministracion'");
  });

  it('a transición final escribe COMPLETA na mesma persoa', () => {
    expect(invitacionAppsScript).toContain("poñerValorPersoaAdmin_(fila, indices, 'EstadoAlta', 'COMPLETA')");
    expect(invitacionAppsScript).toContain("atoparIndiceFilaPersoaAdmin_(valores, indices, referencia)");
    expect(invitacionAppsScript).toContain("estadoAlta: 'COMPLETA'");
  });
});
