import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('functions/api/ensaios.js', 'utf8');

describe('alta de ensaio asociada a concerto', () => {
  it('carga automaticamente as obras do programa do concerto', () => {
    expect(source).toContain('async function gardarEnsaioConPrograma');
    expect(source).toContain('idsProgramaConcerto(context.env, user, idConcerto, repertorio)');
    expect(source).toContain("chamarAppsScript(context.env, user, 'gardarEnsaioRepertorioPortal'");
    expect(source).toContain("if (accion === 'gardarEnsaio') return await gardarEnsaioConPrograma(context, user, body);");
  });

  it('mantén unha alternativa por Apps Script se o índice privado non resolve o programa', () => {
    expect(source).toContain("'obterXestionConcertoAdministracionPortal'");
    expect(source).toContain('resolverIdsPrograma(xestion?.programa, repertorio)');
  });
});
