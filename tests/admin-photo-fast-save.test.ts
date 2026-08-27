import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(resolve(root, 'functions/_lib/fotos-administracion-v2.js'), 'utf8');
const route = readFileSync(resolve(root, 'functions/api/xestion-publicacion-foto.js'), 'utf8');

describe('Gardado verificado de Fotografías en Preview', () => {
  it('usa temporalmente o backend v2 con verificación final de R2', () => {
    expect(route).toContain('onRequestFotosAdministracionV2');
    expect(route).not.toContain('onRequestFotosAdministracionV2Fast');
    expect(worker).toContain("accion: 'gardarFotoAdministracionPortal'");
    expect(worker).toContain('const [pubV, priV, revV, catV]');
  });

  it('non confirma éxito ata reler os índices e validar o catálogo', () => {
    expect(worker).toContain('A verificación final de R2 non coincide co estado solicitado');
    expect(worker).toContain('O catálogo R2 non confirmou os metadatos gardados');
    expect(worker).toContain('limparEdicion');
  });
});
