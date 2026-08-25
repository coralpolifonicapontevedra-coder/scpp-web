import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(resolve(root, 'functions/_lib/fotos-administracion-v2.js'), 'utf8');
const route = readFileSync(resolve(root, 'functions/api/xestion-publicacion-foto.js'), 'utf8');
const appsScript = readFileSync(resolve(root, 'apps-script/fotos-administracion-v2.gs'), 'utf8');
const prepare = readFileSync(resolve(root, 'scripts/prepare-fotos-admin-v2-preview.mjs'), 'utf8');

describe('Administración de Fotografías v2', () => {
  it('substitúe a ruta histórica polo backend novo', () => {
    expect(route).toContain('onRequestFotosAdministracionV2');
    expect(route).not.toContain('actualizarPublicacionFoto');
    expect(route).not.toContain('actualizarRevisionFoto');
    expect(route).not.toContain('gardarRutasFotoR2');
  });

  it('usa unha única acción nova para gardar Sheet', () => {
    expect(worker).toContain("accion: 'gardarFotoAdministracionPortal'");
    expect(worker).toContain("accion: 'comprobarFotosAdministracionPortal'");
    expect(worker).not.toContain("accion: 'actualizarPublicacionFoto'");
    expect(worker).not.toContain("accion: 'actualizarRevisionFoto'");
    expect(worker).not.toContain("accion: 'gardarRutasFotoR2'");
  });

  it('autoriza só co resolvedor central de permisos', () => {
    expect(appsScript).toContain('resolverPermisosPortal_');
    expect(appsScript).toContain("indexOf('ADMINISTRACION')");
    expect(appsScript).not.toContain('UsuariosWeb');
    expect(appsScript).not.toContain('RevisarFotos');
    expect(appsScript).not.toContain('obterAdministradorFotos_');
  });

  it('prepara exclusivamente o Apps Script de Preview', () => {
    expect(prepare).toContain("const PREVIEW_SCRIPT_ID = '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF'");
    expect(prepare).toContain('gardarFotoAdministracionPortal');
    expect(prepare).toContain('comprobarFotosAdministracionPortal');
    expect(prepare).toContain('NON se executou clasp push');
  });
});
