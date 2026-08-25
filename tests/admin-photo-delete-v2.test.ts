import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(resolve(root, 'functions/api/eliminar-foto-revision.js'), 'utf8');
const appsScript = readFileSync(resolve(root, 'apps-script/fotos-administracion-v2.gs'), 'utf8');
const prepare = readFileSync(resolve(root, 'scripts/prepare-fotos-admin-v2-preview.mjs'), 'utf8');
const dispatcherClient = readFileSync(resolve(root, 'functions/_lib/apps-script.js'), 'utf8');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');

describe('Borrado de fotografías v2 en Preview', () => {
  it('non usa o borrado histórico nin fallback a produción', () => {
    expect(worker).toContain("accion: 'eliminarFotoAdministracionPortal'");
    expect(worker).not.toContain("accion: 'eliminarFotoPortal'");
    expect(dispatcherClient).toContain("'eliminarFotoAdministracionPortal'");
  });

  it('está restrinxido ao host Preview e comproba marcadores dos buckets clonados', () => {
    expect(worker).toContain("const PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org'");
    expect(worker).toContain('previewCloneSourceEtag');
    expect(worker).toContain("meta.previewClone");
    expect(worker).toContain("meta.backend");
  });

  it('retira primeiro os índices e fai rollback se falla a Sheet', () => {
    expect(worker).toContain('rollbackIndices');
    expect(worker).toContain('await chamarBorradoSheet');
    expect(worker).toContain('await rollbackIndices(env, backup)');
  });

  it('Apps Script só permite os recursos físicos de Fotos de Preview', () => {
    expect(appsScript).toContain("FOTOS_PREVIEW_SPREADSHEET_ID_V2_ = '1QnsnM2dTpsme0-xPynEZVOAEdY4gKkvnvhKKtKPVEDY'");
    expect(appsScript).toContain("FOTOS_PREVIEW_FOLDER_ID_V2_ = '1dlNy6ht2AZcSRJF_CkWH-XbGIsTijMiO'");
    expect(appsScript).toContain('validarEntornoEliminacionFotosV2_');
    expect(appsScript).toContain('resolverPermisosPortal_');
  });

  it('o preparador conecta a nova acción só no Apps Script de Preview', () => {
    expect(prepare).toContain("const PREVIEW_SCRIPT_ID = '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF'");
    expect(prepare).toContain("accion === 'eliminarFotoAdministracionPortal'");
  });

  it('retira a ferramenta temporal de migración e o bloqueo visual antigo', () => {
    expect(existsSync(resolve(root, 'functions/api/migrar-r2-preview.js'))).toBe(false);
    expect(existsSync(resolve(root, 'src/pages/portal/administracion/migracion-r2-preview.astro'))).toBe(false);
    expect(existsSync(resolve(root, 'tests/r2-preview-migration.test.ts'))).toBe(false);
    expect(existsSync(resolve(root, 'public/js/admin-fotografias-delete-safety.js'))).toBe(false);
    expect(middleware).not.toContain('admin-fotografias-delete-safety.js');
  });
});
