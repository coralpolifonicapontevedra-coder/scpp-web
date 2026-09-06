import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/js/portal-fast-load.js', 'utf8');

describe('portal-fast-load e aceptación legal', () => {
  it('non intercepta nin falsea a comprobación de aceptación', () => {
    expect(source).not.toContain('/api/aceptacion');
    expect(source).not.toContain('X-SCPP-Acceptance-Cache');
    expect(source).not.toContain('acceptanceKey');
    expect(source).not.toContain('readAcceptance');
    expect(source).not.toContain('saveAcceptance');
    expect(source).not.toContain('aceptacionVixente: true');
  });

  it('usa exclusivamente a caché R2 sincronizada para a carga rápida de Repertorio', () => {
    expect(source).toContain('/api/repertorio-cache-v2');
    expect(source).toContain("body?.accion === 'listarRepertorioPortal'");
    expect(source).toContain('localStorage');
    expect(source).not.toContain('buildFastWorks');
    expect(source).not.toContain('docs.google.com/spreadsheets');
  });
});
