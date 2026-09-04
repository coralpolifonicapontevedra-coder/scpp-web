import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/pages/portal/administracion/persoas.astro'),
  'utf8'
);

describe('Administración de Persoas simplificada', () => {
  it('mantén unha única alta e elimina a alta por invitación da interface', () => {
    expect(source).toContain('id="new-person-button"');
    expect(source).not.toContain('invite-person-button');
    expect(source).not.toContain('Alta por invitación');
  });

  it('mantén un borrado definitivo separado da baixa', () => {
    expect(source).toContain('id="delete-person"');
    expect(source).toContain('Eliminar rexistro da Sheet');
    expect(source).toContain("requestV2('eliminarPersoaAdministracion'");
    expect(source).toContain("requestV2('cambiarEstadoPersoaAdministracion'");
  });
});
