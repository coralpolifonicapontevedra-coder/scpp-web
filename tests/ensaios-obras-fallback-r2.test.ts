import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('functions/api/ensaios-obras.js', 'utf8');

describe('Ensaios obras para coralistas', () => {
  it('usa o índice principal de Ensaios cando non existe borrador R2', () => {
    expect(source).toContain("const ENSAIOS_CACHE_PREFIX='ensaios/cache-v2/usuarios/';");
    expect(source).toContain('async function latestSharedPayload');
    expect(source).toContain('ensaiosRepertorio');
  });

  it('non devolve cero obras só porque falte o borrador', () => {
    expect(source).toContain('fallbackRepertorio');
    expect(source).toContain('const repertorio=draftRepertorio.length?draftRepertorio:fallbackRepertorio.length?fallbackRepertorio:concertRepertorio');
  });
});
