import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const route = readFileSync(resolve(root, 'functions/api/eliminar-foto-revision.js'), 'utf8');
const worker = readFileSync(resolve(root, 'functions/_lib/fotos-delete-v3.js'), 'utf8');
const recoveryWorker = readFileSync(resolve(root, 'functions/_lib/fotos-delete-v4.js'), 'utf8');
const appsScript = readFileSync(resolve(root, 'apps-script/fotos-administracion-v2.gs'), 'utf8');
const orphanAppsScript = readFileSync(resolve(root, 'apps-script/fotos-huerfanas-v2.gs'), 'utf8');
const prepare = readFileSync(resolve(root, 'scripts/prepare-fotos-admin-v2-preview.mjs'), 'utf8');
const dispatcherClient = readFileSync(resolve(root, 'functions/_lib/apps-script.js'), 'utf8');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');

describe('Borrado de fotografías v4 en Preview', () => {
  it('mantén a ruta pública e delega no backend v4', () => {
    expect(route).toContain("../_lib/fotos-delete-v4.js");
    expect(route).toContain('onRequestFotosDeleteV4');
  });

  it('conserva o borrado v3 como núcleo de autorización e transacción', () => {
    expect(recoveryWorker).toContain("./fotos-delete-v3.js");
    expect(recoveryWorker).toContain('onRequestFotosDeleteV3');
    expect(worker).toContain("'eliminarFotoAdministracionPortal'");
    expect(worker).toContain("'eliminarFotoHuerfanaAdministracionPortal'");
    expect(worker).not.toContain("accion: 'eliminarFotoPortal'");
    expect(dispatcherClient).toContain("'eliminarFotoAdministracionPortal'");
    expect(dispatcherClient).toContain("'eliminarFotoHuerfanaAdministracionPortal'");
  });

  it('está restrinxido ao host Preview e comproba marcadores dos buckets clonados', () => {
    expect(worker).toContain("const PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org'");
    expect(worker).toContain('previewCloneSourceEtag');
    expect(worker).toContain('meta.previewClone');
    expect(worker).toContain('meta.backend');
    expect(recoveryWorker).toContain("const PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org'");
    expect(recoveryWorker).toContain('previewCloneSourceEtag');
    expect(recoveryWorker).toContain('meta.previewClone');
    expect(recoveryWorker).toContain('meta.backend');
  });

  it('só clasifica como huérfano un rexistro sen rutas nin residuos R2 coñecidos', () => {
    expect(worker).toContain('residuosCoId');
    expect(worker).toContain('ORPHAN_HAS_R2_RESIDUES');
    expect(worker).toContain('huerfana: true');
    expect(worker).toContain('fotos/editadas-miniaturas/${id}-');
  });

  it('recupera os residuos R2 só cando todos se verifican como propios de Preview', () => {
    expect(recoveryWorker).toContain("'ORPHAN_HAS_R2_RESIDUES'");
    expect(recoveryWorker).toContain('localizarResiduos');
    expect(recoveryWorker).toContain('fotoMarcadaPreview');
    expect(recoveryWorker).toContain('R2_RECOVERY_NOT_VERIFIED');
    expect(recoveryWorker).toContain('inxectarRutaRecuperada');
    expect(recoveryWorker).toContain('restaurarInxeccion');
    expect(recoveryWorker).toContain('rutasRecuperadas: true');
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

  it('a limpeza huérfana non borra ficheiros e esixe que non existan en Drive', () => {
    expect(orphanAppsScript).toContain('eliminarFotoHuerfanaAdministracionPortal_');
    expect(orphanAppsScript).toContain('ORPHAN_HAS_R2_ROUTE');
    expect(orphanAppsScript).toContain('ORPHAN_HAS_DRIVE_FILE');
    expect(orphanAppsScript).toContain('getFilesByName');
    expect(orphanAppsScript).not.toContain('setTrashed(true)');
    expect(orphanAppsScript).not.toContain('DriveApp.getFileById');
  });

  it('o preparador conecta as dúas accións de borrado só no Apps Script de Preview', () => {
    expect(prepare).toContain("const PREVIEW_SCRIPT_ID = '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF'");
    expect(prepare).toContain("accion === 'eliminarFotoAdministracionPortal'");
    expect(prepare).toContain("accion === 'eliminarFotoHuerfanaAdministracionPortal'");
    expect(prepare).toContain("fotos-huerfanas-v2.js");
  });

  it('retira a ferramenta temporal de migración e o bloqueo visual antigo', () => {
    expect(existsSync(resolve(root, 'functions/api/migrar-r2-preview.js'))).toBe(false);
    expect(existsSync(resolve(root, 'src/pages/portal/administracion/migracion-r2-preview.astro'))).toBe(false);
    expect(existsSync(resolve(root, 'tests/r2-preview-migration.test.ts'))).toBe(false);
    expect(existsSync(resolve(root, 'public/js/admin-fotografias-delete-safety.js'))).toBe(false);
    expect(middleware).not.toContain('admin-fotografias-delete-safety.js');
  });
});
