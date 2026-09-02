import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('functions/api/aceptacion.js');
const source = fs.readFileSync(file, 'utf8');

describe('caché R2 de aceptación', () => {
  it('esixe texto legal completo cando a aceptación non está vixente', () => {
    expect(source).toContain('function textoLegalCompleto(textoLegal)');
    expect(source).toContain("String(textoLegal?.version || '').trim()");
    expect(source).toContain("String(textoLegal?.titulo || '').trim()");
    expect(source).toContain("String(textoLegal?.texto || '').trim()");
    expect(source).toContain(
      'if (cache.aceptacionVixente === false && !textoLegalCompleto(cache.textoLegal)) return null;'
    );
  });

  it('mantén a caché positiva sen alterar o fluxo existente', () => {
    expect(source).toContain("if (typeof cache?.aceptacionVixente !== 'boolean') return null;");
    expect(source).toContain("'X-SCPP-AppScript': 'R2-CACHE'");
    expect(source).toContain('CACHE_ACEPTACION_MS = 10 * 60 * 1000');
  });
});
