import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'public/css/admin-fotografias-compactas.css'), 'utf8');
const filtros = readFileSync(resolve(root, 'public/js/admin-fotografias-filtros.js'), 'utf8');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');

describe('fotografías compactas e filtros rápidos', () => {
  it('reduce as tarxetas aproximadamente á metade', () => {
    expect(css).toContain('minmax(155px, 1fr)');
    expect(css).toContain('minmax(145px, 1fr)');
    expect(css).toContain('repeat(2, minmax(0, 1fr))');
  });

  it('ofrece filtros rápidos por estado e limpeza', () => {
    expect(filtros).toContain("['pendente', 'Pendentes']");
    expect(filtros).toContain("['publica', 'Públicas']");
    expect(filtros).toContain("['privada', 'Privadas']");
    expect(filtros).toContain("['nonpublicada', 'Non publicadas']");
    expect(filtros).toContain("reset.textContent = 'Limpar filtros'");
    expect(filtros).toContain("select.dispatchEvent(new Event('change'");
  });

  it('carga os axustes só na administración de fotografías', () => {
    expect(middleware).toContain('/css/admin-fotografias-compactas.css');
    expect(middleware).toContain('/js/admin-fotografias-filtros.js');
    expect(middleware).toContain("pathname === '/portal/administracion/fotografias'");
  });
});
