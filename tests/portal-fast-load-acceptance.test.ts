import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/js/portal-fast-load.js', 'utf8');

describe('portal-fast-load e aceptación legal', () => {
  it('non intercepta nin falsea a comprobación de aceptación', () => {
    expect(source).not.toContain("/api/aceptacion");
    expect(source).not.toContain('X-SCPP-Acceptance-Cache');
    expect(source).not.toContain('acceptanceKey');
    expect(source).not.toContain('readAcceptance');
    expect(source).not.toContain('saveAcceptance');
    expect(source).not.toContain('aceptacionVixente: true');
  });

  it('mantén a optimización específica do repertorio', () => {
    expect(source).toContain("/api/repertorio");
    expect(source).toContain("body?.accion === 'listarRepertorioPortal'");
    expect(source).toContain('buildFastWorks');
    expect(source).toContain('backgroundFullRequest');
  });
});
