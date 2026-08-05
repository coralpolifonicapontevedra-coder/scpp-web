import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const middlewarePath = resolve(root, 'functions/portal/_middleware.js');
const middleware = readFileSync(middlewarePath, 'utf8');

describe('integración do xestor de fotografías', () => {
  it('carga o xestor na ruta canónica de revisión', () => {
    expect(middleware).toContain("pathname === '/portal/revision-fotos'");
    expect(middleware).not.toContain("pathname === '/portal/revision-fotos-nova'");
  });

  it.each([
    'xestor-fotos-publicacion.js',
    'xestor-fotos-metadatos.js',
    'borrador-fotos-pendente.js',
    'renovar-borrador-foto.js'
  ])('referencia un módulo existente: %s', (script) => {
    expect(middleware).toContain(`/js/${script}`);
    expect(existsSync(resolve(root, 'public/js', script))).toBe(true);
  });
});
