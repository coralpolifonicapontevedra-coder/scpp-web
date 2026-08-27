import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const route = readFileSync(resolve(root, 'functions/api/eliminar-foto-revision.js'), 'utf8');
const fastWorker = readFileSync(resolve(root, 'functions/_lib/fotos-delete-v5-fast-preview.js'), 'utf8');
const worker = readFileSync(resolve(root, 'functions/_lib/fotos-delete-v3.js'), 'utf8');
const recoveryWorker = readFileSync(resolve(root, 'functions/_lib/fotos-delete-v4.js'), 'utf8');
const appsScript = readFileSync(resolve(root, 'apps-script/fotos-administracion-v2.gs'), 'utf8');
const orphanAppsScript = readFileSync(resolve(root, 'apps-script/fotos-huerfanas-v2.gs'), 'utf8');
const prepare = readFileSync(resolve(root, 'scripts/prepare-fotos-admin-v2-preview.mjs'), 'utf8');
const dispatcherClient = readFileSync(resolve(root, 'functions/_lib/apps-script.js'), 'utf8');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');

describe('Borrado rápido e seguro de fotografías en Preview', () => {
  it('usa v5 rápido e conserva v4/v3 como fallback seguro', () => {
    expect(route).toContain('onRequestFotosDeleteV5FastPreview');
    expect(fastWorker).toContain("./fotos-delete-v4.js");
    expect(fastWorker).toContain('onRequestFotosDeleteV4(context)');
    expect(recoveryWorker).toContain("./fotos-delete-v3.js");
  });

  it('evita a autorización previa redundante contra Apps Script', () => {
    expect(fastWorker).toContain('administracionCacheada');
    expect(fastWorker).toContain("accion: 'eliminarFotoAdministracionPortal'");
    expect(fastWorker).not.toContain("accion: 'comprobarFotosAdministracionPortal'");
  });

  it('mantén rollback antes da confirmación destrutiva final', () => {
    expect(fastWorker).toContain('rollbackIndices');
    expect(fastWorker).toContain('await chamarBorradoSheet');
    expect(fastWorker).toContain('await rollbackIndices(env, backup)');
  });

  it('fai en paralelo a verificación de rutas e deixa a limpeza R2 para segundo plano', () => {
    expect(fastWorker).toContain('Promise.all(claves.flatMap');
    expect(fastWorker).toContain("limpezaR2: 'segundo-plano'");
    expect(fastWorker).toContain('context.waitUntil(limpeza)');
    expect(fastWorker).not.toContain('pubCheck');
  });

  it('segue restrinxido ao host e aos obxectos de Preview', () => {
    expect(fastWorker).toContain("PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org'");
    expect(fastWorker).toContain('previewCloneSourceEtag');
    expect(fastWorker).toContain('R2_PREVIEW_NOT_VERIFIED');
    expect(worker).toContain("const PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org'");
  });

  it('Apps Script só permite os recursos físicos de Fotos de Preview', () => {
    expect(appsScript).toContain("FOTOS_PREVIEW_SPREADSHEET_ID_V2_ = '1QnsnM2dTpsme0-xPynEZVOAEdY4gKkvnvhKKtKPVEDY'");
    expect(appsScript).toContain("FOTOS_PREVIEW_FOLDER_ID_V2_ = '1dlNy6ht2AZcSRJF_CkWH-XbGIsTijMiO'");
    expect(appsScript).toContain('validarEntornoEliminacionFotosV2_');
    expect(appsScript).toContain('resolverPermisosPortal_');
  });

  it('a limpeza huérfana conserva as gardas existentes', () => {
    expect(orphanAppsScript).toContain('ORPHAN_HAS_R2_ROUTE');
    expect(orphanAppsScript).toContain('ORPHAN_HAS_DRIVE_FILE');
    expect(orphanAppsScript).not.toContain('setTrashed(true)');
  });

  it('o preparador segue apuntando só ao Apps Script de Preview', () => {
    expect(prepare).toContain("const PREVIEW_SCRIPT_ID = '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF'");
    expect(prepare).toContain("accion === 'eliminarFotoAdministracionPortal'");
    expect(dispatcherClient).toContain("'eliminarFotoAdministracionPortal'");
  });

  it('mantén retiradas as ferramentas temporais antigas', () => {
    expect(existsSync(resolve(root, 'functions/api/migrar-r2-preview.js'))).toBe(false);
    expect(existsSync(resolve(root, 'src/pages/portal/administracion/migracion-r2-preview.astro'))).toBe(false);
    expect(existsSync(resolve(root, 'public/js/admin-fotografias-delete-safety.js'))).toBe(false);
    expect(middleware).not.toContain('admin-fotografias-delete-safety.js');
  });
});
