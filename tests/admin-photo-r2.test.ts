import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = readFileSync(resolve(root, 'functions/api/administracion-fotografias.js'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/portal/administracion/fotografias.astro'), 'utf8');
const adminHome = readFileSync(resolve(root, 'src/pages/portal/administracion.astro'), 'utf8');
const adminNav = readFileSync(resolve(root, 'src/components/AdministracionNav.astro'), 'utf8');

describe('administración rápida de fotografías', () => {
  it('abre o catálogo só desde R2, sen Apps Script', () => {
    expect(api).toContain("const INDEX_REVISION = 'indices/revision-fotos-v1.json'");
    expect(api).toContain("const CATALOGO = 'indices/catalogo-fotos.json'");
    expect(api).not.toContain("../_lib/apps-script.js");
    expect(api).not.toContain('obterJsonAppsScript');
    expect(api).toContain("orixe: 'R2-ONLY'");
  });

  it('carga miniaturas en lotes e con tarxetas amplas', () => {
    expect(page).toContain("accion: 'miniaturas'");
    expect(page).toContain('slice(0, 18)');
    expect(page).toContain('minmax(315px,1fr)');
  });

  it('sitúa Fotografías dentro de Administración', () => {
    expect(adminHome).toContain("path:'/portal/administracion/fotografias/'");
    expect(adminNav).toContain("{ id: 'fotografias', label: 'Fotografías', path: '/portal/administracion/fotografias/' }");
  });
});
