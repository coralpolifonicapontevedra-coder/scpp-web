import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const page = readFileSync(resolve(root, 'src/pages/portal/administracion/persoas.astro'), 'utf8');
const worker = readFileSync(resolve(root, 'functions/api/persoas-v2.js'), 'utf8');
const invitation = readFileSync(resolve(root, 'apps-script-preview/persoas-alta-invitacion.js'), 'utf8');
const dispatcher = readFileSync(resolve(root, 'apps-script-preview/xestion-permisos-dispatcher-integracion.js'), 'utf8');

describe('Administración de Persoas: altas, eliminación e navegación', () => {
  it('usa a navegación común de Administración en Persoas', () => {
    expect(page).toContain("import AdministracionNav from '../../../components/AdministracionNav.astro';");
    expect(page).toContain('<AdministracionNav active="persoas" />');
  });

  it('ofrece alta manual e alta por invitación separadas', () => {
    expect(page).toContain('id="new-person-button"');
    expect(page).toContain('id="invite-person-button"');
    expect(page).toContain("'crearPersoaInvitacionAdministracion'");
    expect(worker).toContain("'crearPersoaInvitacionAdministracion'");
  });

  it('non esixe unha columna EstadoAlta que non existe na Sheet real', () => {
    expect(invitation).not.toContain("requireHeaderPersoasAdmin_(indices, 'EstadoAlta', 'Persoas')");
    expect(invitation).toContain('if (indices.EstadoAlta !== undefined)');
  });

  it('permite eliminar unha fila de Persoas e actualiza a caché pola ruta v2', () => {
    expect(page).toContain('id="delete-person"');
    expect(page).toContain("requestV2('eliminarPersoaAdministracion'");
    expect(worker).toContain("'eliminarPersoaAdministracion'");
    expect(dispatcher).toContain("if (accion === 'eliminarPersoaAdministracion')");
    expect(invitation).toContain('contexto.persoas.deleteRow(indiceFila + 1)');
  });

  it('impide borrar a propia ficha administrativa', () => {
    expect(invitation).toContain('Non podes eliminar a túa propia ficha administrativa.');
  });
});
