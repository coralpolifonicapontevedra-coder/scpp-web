import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');
const legacyPage = readFileSync(resolve(root, 'src/pages/portal/revision-fotos.astro'), 'utf8');
const publicationApi = readFileSync(resolve(root, 'functions/api/xestion-publicacion-foto.js'), 'utf8');
const originalApi = readFileSync(resolve(root, 'functions/api/editor-fotos-original.js'), 'utf8');

describe('integración da administración de fotografías', () => {
  it('carga o editor integrado só na nova ruta administrativa', () => {
    expect(middleware).toContain("pathname === '/portal/administracion/fotografias'");
    expect(middleware).toContain('/js/admin-fotografias-editor.js');
    expect(middleware).not.toContain("pathname === '/portal/revision-fotos'");
    expect(existsSync(resolve(root, 'public/js/admin-fotografias-editor.js'))).toBe(true);
  });

  it('mantén a ruta antiga como redirección compatible', () => {
    expect(legacyPage).toContain("Astro.url.searchParams.get('idFoto')");
    expect(legacyPage).toContain('/portal/administracion/fotografias/');
    expect(legacyPage).toContain('Astro.redirect');
    expect(legacyPage).not.toContain('editor-canvas');
  });

  it('garda a imaxe editada, a miniatura e as rutas R2 no fluxo verificado', () => {
    expect(publicationApi).toContain("const MAX_IMAGE_BYTES = 12 * 1024 * 1024");
    expect(publicationApi).toContain("accion: 'gardarRutasFotoR2'");
    expect(publicationApi).toContain('miniaturaBase64');
    expect(publicationApi).toContain("estado: 'sincronizada'");
    expect(publicationApi).toContain('A galería pública non apunta á versión editada');
  });

  it('permite abrir o orixinal coa caché administrativa xa existente', () => {
    expect(originalApi).toContain("const ADMIN_AUTH_PREFIX = 'persoas/cache/administracion/'");
    expect(originalApi).toContain("datos?.payload?.perfil?.nivel === 'Administración'");
  });
});
