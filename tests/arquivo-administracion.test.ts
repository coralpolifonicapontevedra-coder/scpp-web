import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('módulo de arquivo e préstamos', () => {
  it('está accesible desde a portada e a navegación administrativa', () => {
    expect(read('src/pages/portal/administracion.astro')).toContain('/portal/administracion/arquivo/');
    expect(read('src/components/AdministracionNav.astro')).toContain("active === item.id");
    expect(read('src/components/AdministracionNav.astro')).toContain("id: 'arquivo'");
  });

  it('ofrece alta, edición, baixa lóxica e reactivación de fondos', () => {
    const page = read('src/pages/portal/administracion/arquivo.astro');
    expect(page).toContain("gardarFondoAdministracion");
    expect(page).toContain("Dar de baixa");
    expect(page).toContain("Reactivar");
    expect(page).toContain("Estado:baixa?'Arquivado':'Activo'");
    expect(page).not.toContain('eliminarFondoAdministracion');
  });

  it('restrinxe a API a Administración e ás accións previstas', () => {
    const api = read('functions/api/arquivo-admin.js');
    expect(api).toContain("Só Administración pode xestionar o arquivo");
    for (const action of ['listarArquivoAdministracion','gardarFondoAdministracion','gardarElementoFondoAdministracion','gardarMovementoArquivoAdministracion','gardarElementoMovementoAdministracion','rexistrarDevolucionArquivoAdministracion']) {
      expect(api).toContain(action);
    }
  });

  it.each(['apps-script-preview', 'apps-script-production'])('inclúe o backend de Sheets en %s', (dir) => {
    const backend = read(`${dir}/arquivo-administracion.js`);
    const dispatcher = read(`${dir}/Código.js`);
    expect(backend).toContain("filasArquivo_('Fondos')");
    expect(backend).toContain("mov.Estado='Devolto'");
    expect(dispatcher).toContain("accion === 'listarArquivoAdministracion'");
  });
});
