import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('functions/api/concertos-admin.js', 'utf8');

describe('recuperación de borradores de Concertos', () => {
  it('non considera válido un borrador sen persoas ou sen repertorio', () => {
    expect(source).toContain('Array.isArray(value.persoas) && value.persoas.length > 0');
    expect(source).toContain('Array.isArray(value.obras) && value.obras.length > 0');
  });

  it('reconstrúe a xestión cando o borrador gardado non é válido', () => {
    expect(source).toContain('if (validDraft(saved, id)) return saved;');
    expect(source).toContain('const desdeR2 = await managementFromR2(env, user, id);');
    expect(source).toContain('if (desdeR2.persoas.length && desdeR2.obras.length) initial = desdeR2;');
    expect(source).toContain("await chamarAppsScript(env, user, 'obterXestionConcertoAdministracionPortal'");
  });
});
