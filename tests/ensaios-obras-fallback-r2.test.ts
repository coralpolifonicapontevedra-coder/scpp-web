import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('functions/api/ensaios-obras.js', 'utf8');

describe('Ensaios obras para coralistas', () => {
  it('prioriza o índice confirmado de administración v4', () => {
    expect(source).toContain("const ADMIN_INDEX_MAIN='indices/ensaios-admin-v4.json';");
    expect(source).toContain("const ADMIN_INDEX_PREVIEW='indices/preview/ensaios-admin-v4.json';");
    expect(source).toContain("fonte:'R2-ADMIN-V4'");
  });

  it('mantén fallbacks antigos só despois do índice v4', () => {
    expect(source).toContain("const ENSAIOS_CACHE_PREFIX='ensaios/cache-v2/usuarios/';");
    expect(source).toContain('async function latestSharedPayload');
    expect(source).toContain("fonte:'R2-CACHE-V2'");
  });

  it('non deixa que un borrador v1 obsoleto tape as obras xa confirmadas', () => {
    expect(source).not.toContain("const DRAFT_PREFIX='ensaios/borradores-v1/';");
    expect(source).toContain('const repertorio=fallbackRepertorio.length?fallbackRepertorio:concertRepertorio');
  });
});
