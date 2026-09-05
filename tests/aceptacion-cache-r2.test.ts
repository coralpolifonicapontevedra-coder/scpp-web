import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('functions/api/aceptacion.js');
const source = fs.readFileSync(file, 'utf8');

describe('caché R2 de aceptación', () => {
  it('esixe texto legal completo cando a aceptación non está vixente', () => {
    expect(source).toContain('function textoLegalCompleto(textoLegal)');
    expect(source).toContain('clean(textoLegal?.version)');
    expect(source).toContain('clean(textoLegal?.titulo)');
    expect(source).toContain('clean(textoLegal?.texto)');
    expect(source).toContain(
      'if (cache.aceptacionVixente === false && !textoLegalCompleto(cache.textoLegal)) return null;'
    );
  });

  it('mantén a caché positiva sen alterar o fluxo existente', () => {
    expect(source).toContain("if (typeof cache?.aceptacionVixente !== 'boolean') return null;");
    expect(source).toContain("'X-SCPP-AppScript': cache.fresca ? 'R2-CACHE' : 'R2-STALE-WHILE-REVALIDATE'");
    expect(source).toContain('CACHE_ACEPTACION_FRESCA_MS = 60 * 60 * 1000');
    expect(source).toContain('CACHE_ACEPTACION_RESPALDO_MS = 30 * 24 * 60 * 60 * 1000');
  });
});
