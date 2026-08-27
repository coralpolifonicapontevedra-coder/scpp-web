import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const route = readFileSync(resolve(root, 'functions/api/eliminar-foto-revision.js'), 'utf8');
const worker = readFileSync(resolve(root, 'functions/_lib/fotos-delete-v3.js'), 'utf8');
const recoveryWorker = readFileSync(resolve(root, 'functions/_lib/fotos-delete-v4.js'), 'utf8');
const appsScript = readFileSync(resolve(root, 'apps-script/fotos-administracion-v2.gs'), 'utf8');
const orphanAppsScript = readFileSync(resolve(root, 'apps-script/fotos-huerfanas-v2.gs'), 'utf8');
const prepare = readFileSync(resolve(root, 'scripts/prepare-fotos-admin-v2-production.mjs'), 'utf8');
const dispatcherClient = readFileSync(resolve(root, 'functions/_lib/apps-script.js'), 'utf8');

describe('Borrado seguro de fotografías en Producción', () => {
  it('usa o backend v4 validado en Preview, adaptado a Producción', () => {
    expect(route).not.toContain('FOTOS_DELETE_PRODUCTION_ENABLED');
    expect(route).not.toContain('onRequestFotosDeleteV5Fast');
    expect(route).toContain('onRequestFotosDeleteV4');
    expect(route).toContain("../_lib/fotos-delete-v4.js");
  });

  it('acepta o alias estable de Producción sen abrir Preview', () => {
    expect(route).toContain("PRODUCTION_ALIAS = 'produccion.coralpolifonicapontevedra.org'");
    expect(route).toContain("PRODUCTION_CANONICAL_HOST = 'scpp-web.pages.dev'");
    expect(route).not.toContain("preview.coralpolifonicapontevedra.org");
  });

  it('mantén v4/v3 e rollback para os casos de borrado', () => {
    expect(recoveryWorker).toContain("./fotos-delete-v3.js");
    expect(worker).toContain('rollbackIndices');
    expect(worker).toContain("'eliminarFotoAdministracionPortal'");
    expect(worker).toContain("'eliminarFotoHuerfanaAdministracionPortal'");
    expect(worker).toContain('accion,');
  });

  it('mantén as gardas específicas contra obxectos de Preview', () => {
    expect(recoveryWorker).toContain('previewCloneSourceEtag');
    expect(recoveryWorker).toContain('fotoMarcadaPreview');
  });

  it('Apps Script segue esixindo os recursos físicos exactos de Producción', () => {
    expect(appsScript).toContain("FOTOS_PRODUCTION_SPREADSHEET_ID_V2_ = '1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w'");
    expect(appsScript).toContain("FOTOS_PRODUCTION_FOLDER_ID_V2_ = '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix'");
    expect(appsScript).toContain("entorno: 'production'");
  });

  it('a limpeza huérfana comproba Drive e non borra ficheiros por si mesma', () => {
    expect(orphanAppsScript).toContain('ORPHAN_HAS_R2_ROUTE');
    expect(orphanAppsScript).toContain('ORPHAN_HAS_DRIVE_FILE');
    expect(orphanAppsScript).not.toContain('setTrashed(true)');
  });

  it('non cambia a configuración compartida de Apps Script', () => {
    expect(dispatcherClient).toContain("'comprobarFotosAdministracionPortal'");
    expect(dispatcherClient).toContain("'gardarFotoAdministracionPortal'");
    expect(dispatcherClient).toContain("'eliminarFotoAdministracionPortal'");
    expect(prepare).toContain("const PRODUCTION_SCRIPT_ID = '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV'");
  });
});
