import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');
const legacyPage = readFileSync(resolve(root, 'src/pages/portal/revision-fotos.astro'), 'utf8');
const publicationApi = readFileSync(resolve(root, 'functions/api/xestion-publicacion-foto.js'), 'utf8');
const originalApi = readFileSync(resolve(root, 'functions/api/editor-fotos-original.js'), 'utf8');

describe('integración da administración de fotografías en Producción', () => {
  it('carga o editor integrado só na ruta administrativa', () => {
    expect(middleware).toContain("pathname === '/portal/administracion/fotografias'");
    expect(middleware).toContain('/js/admin-fotografias-editor.js');
    expect(middleware).toContain('/js/admin-fotografias-filtros.js');
    expect(middleware).not.toContain("pathname === '/portal/revision-fotos'");
    expect(existsSync(resolve(root, 'public/js/admin-fotografias-editor.js'))).toBe(true);
    expect(existsSync(resolve(root, 'public/js/admin-fotografias-filtros.js'))).toBe(true);
  });

  it('mantén a ruta histórica unicamente como redirección compatible', () => {
    expect(legacyPage).toContain("Astro.url.searchParams.get('idFoto')");
    expect(legacyPage).toContain('/portal/administracion/fotografias/');
    expect(legacyPage).toContain('Astro.redirect');
    expect(legacyPage).not.toContain('editor-canvas');
  });

  it('usa o backend v3 único para gardado e publicación', () => {
    expect(publicationApi).toContain('onRequestFotosAdministracionV3');
    expect(publicationApi).toContain("from '../_lib/fotos-administracion-v3.js'");
    expect(publicationApi).not.toContain('actualizarPublicacionFoto');
    expect(publicationApi).not.toContain('actualizarRevisionFoto');
    expect(publicationApi).not.toContain('gardarRutasFotoR2');
  });

  it('permite abrir o orixinal coa caché administrativa existente', () => {
    expect(originalApi).toContain("const ADMIN_AUTH_PREFIX = 'persoas/cache/administracion/'");
    expect(originalApi).toContain("datos?.payload?.perfil?.nivel === 'Administración'");
    expect(originalApi).toContain("estado?.tipo === 'edicion-integrada' ? 'R2-EDITED' : 'R2-DRAFT-POINTER'");
  });
});
