import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('functions/_lib/apps-script.js', 'utf8');

describe('Ruta de finalización de Ensaios', () => {
  it('forza a reconciliación v4 pola implementación protexida de Ensaios', () => {
    const start = source.indexOf('const ACCIONS_ENSAIOS_PROTEXIDAS');
    const end = source.indexOf(']);', start);
    const actions = source.slice(start, end);

    expect(actions).toContain("'reconciliarEnsaioAdministracionV4'");
  });
});
