import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(resolve(root, 'functions/_lib/fotos-administracion-v2-fast.js'), 'utf8');
const route = readFileSync(resolve(root, 'functions/api/xestion-publicacion-foto.js'), 'utf8');

describe('Gardado rápido de Fotografías en Preview', () => {
  it('usa o backend rápido e unha soa chamada de gardado a Apps Script', () => {
    expect(route).toContain('onRequestFotosAdministracionV2Fast');
    expect(worker).toContain('administracionCacheada');
    expect(worker).toContain("accion: 'gardarFotoAdministracionPortal'");
    expect(worker).not.toContain("accion: 'comprobarFotosAdministracionPortal'");
  });

  it('non relé os catro índices despois de escribir e mantén rollback', () => {
    expect(worker).toContain('R2-PUT+SHEET-FLUSH');
    expect(worker).not.toContain('const [pubV, priV, revV, catV]');
    expect(worker).toContain('Promise.allSettled');
    expect(worker).toContain('limparEdicion');
  });
});
