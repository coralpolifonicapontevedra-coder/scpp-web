import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(resolve(root, 'functions/_lib/fotos-administracion-v2-fast.js'), 'utf8');
const route = readFileSync(resolve(root, 'functions/api/xestion-publicacion-foto.js'), 'utf8');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');
const labelsCss = readFileSync(resolve(root, 'public/css/admin-fotografias-etiquetas.css'), 'utf8');

describe('Gardado rápido de Fotografías', () => {
  it('usa un único salto a Apps Script para gardar e autoriza primeiro desde a caché central', () => {
    expect(route).toContain('onRequestFotosAdministracionV2Fast');
    expect(worker).toContain('administracionCacheada');
    expect(worker).toContain("accion: 'gardarFotoAdministracionPortal'");
    expect(worker).not.toContain("accion: 'comprobarFotosAdministracionPortal'");
  });

  it('evita a segunda lectura completa dos catro índices R2', () => {
    expect(worker).toContain('R2-PUT+SHEET-FLUSH');
    expect(worker).not.toContain('const [pubV, priV, revV, catV]');
  });

  it('mantén rollback de R2 se a Sheet non confirma o gardado', () => {
    expect(worker).toContain('Promise.allSettled');
    expect(worker).toContain('limparEdicion');
    expect(worker).toContain("gardar(env.R2_PUBLICO, INDEX_PUBLICO, pub0, true)");
  });
});

describe('Regra etiqueta + valor no módulo de Fotografías', () => {
  it('carga unha folla de estilo específica en Administración → Fotografías', () => {
    expect(middleware).toContain('admin-fotografias-etiquetas.css?v=20260827-1');
  });

  it('forza separación visible nos metadatos e na conta', () => {
    expect(labelsCss).toContain('.photo-dialog .dialog-meta > span');
    expect(labelsCss).toContain('column-gap: .55rem');
    expect(labelsCss).toContain("content: ':'");
  });
});
