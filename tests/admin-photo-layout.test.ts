import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'public/css/admin-fotografias-compactas.css'), 'utf8');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');

describe('deseño operativo das miniaturas de fotografías', () => {
  it('mostra a imaxe enteira sen recorte nin deformación', () => {
    expect(css).toContain('object-fit: contain !important');
    expect(css).toContain('width: auto !important');
    expect(css).toContain('height: auto !important');
    expect(css).toContain('max-height: 160px !important');
  });

  it('coloca o estado debaixo da imaxe e evita superposicións', () => {
    expect(css).toContain('grid-template-rows: 176px auto');
    expect(css).toContain('position: static !important');
    expect(css).toContain('grid-row: 2');
  });

  it('usa unha grella de revisión equilibrada e forza a nova versión CSS', () => {
    expect(css).toContain('minmax(220px, 260px)');
    expect(middleware).toContain('admin-fotografias-compactas.css?v=20260825-2');
  });
});
