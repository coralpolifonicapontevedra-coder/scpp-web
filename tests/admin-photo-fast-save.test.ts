import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(resolve(root, 'functions/_lib/fotos-administracion-v3.js'), 'utf8');
const route = readFileSync(resolve(root, 'functions/api/xestion-publicacion-foto.js'), 'utf8');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');
const labelsCss = readFileSync(resolve(root, 'public/css/admin-fotografias-etiquetas.css'), 'utf8');

describe('Gardado validado de Fotografías', () => {
  it('usa o backend v3 activo', () => {
    expect(route).toContain('onRequestFotosAdministracionV3');
    expect(route).not.toContain('onRequestFotosAdministracionV2Fast');
    expect(worker).toContain("accion: 'gardarFotoAdministracionPortal'");
    expect(worker).not.toContain("accion: 'comprobarFotosAdministracionPortal'");
  });

  it('confirma Sheet, escribe os catro índices R2 e conserva rollback', () => {
    expect(worker).toContain('A Sheet non confirmou o estado de publicación solicitado');
    expect(worker).toContain('gardar(env.R2_PUBLICO, INDEX_PUBLICO, pub1, true)');
    expect(worker).toContain('gardar(env.R2_PRIVADO, INDEX_PRIVADO, pri1, false)');
    expect(worker).toContain('gardar(env.R2_PRIVADO, INDEX_REVISION, rev1, false)');
    expect(worker).toContain('gardar(env.R2_PRIVADO, CATALOGO, cat1, false)');
    expect(worker).toContain('Promise.allSettled([');
    expect(worker).toContain('gardar(env.R2_PUBLICO, INDEX_PUBLICO, pub0, true)');
    expect(worker).toContain('gardar(env.R2_PRIVADO, CATALOGO, cat0, false)');
  });
});

describe('Separación etiqueta + valor', () => {
  it('carga a versión visual aprobada sen retirar o fallback', () => {
    expect(middleware).toContain('admin-fotografias-etiquetas.css?v=20260827-2');
    expect(middleware).toContain('/js/admin-fotografias-fallback.js?v=20260827-1');
  });

  it('forza separación visible nos metadatos', () => {
    expect(labelsCss).toContain('.photo-dialog .dialog-meta > span');
    expect(labelsCss).toContain('column-gap: .55rem');
  });
});
