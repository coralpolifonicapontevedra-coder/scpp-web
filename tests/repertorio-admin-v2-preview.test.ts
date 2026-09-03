import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/pages/portal/administracion/repertorio.astro', 'utf8');
const api = readFileSync('functions/api/repertorio-admin.js', 'utf8');

describe('Administración de repertorio v2', () => {
  it('separa datos funcionais e información técnica', () => {
    expect(page).toContain('Información técnica');
    expect(page).toContain('Clasificación musical');
    expect(page).toContain('Publicación');
    expect(page).toContain('Editar datos');
  });

  it('inclúe formularios de edición para obras, partituras e audios', () => {
    expect(page).toContain('actualizarObraRepertorioAdministracion');
    expect(page).toContain('actualizarPartituraRepertorioAdministracion');
    expect(page).toContain('actualizarAudioRepertorioAdministracion');
  });

  it('limita a busca aos campos útiles e non ao JSON técnico completo', () => {
    expect(page).toContain('function searchText');
    expect(page).not.toContain('JSON.stringify(x)');
  });

  it('mantén retirada e reactivación de recursos', () => {
    expect(page).toContain('estadoRecursoRepertorioAdministracion');
    expect(page).toContain('Retirar do repertorio activo');
  });

  it('expón no proxy as accións de actualización', () => {
    expect(api).toContain("'actualizarObraRepertorioAdministracion'");
    expect(api).toContain("'actualizarPartituraRepertorioAdministracion'");
    expect(api).toContain("'actualizarAudioRepertorioAdministracion'");
  });
});
