import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const page = read('src/pages/portal/administracion/persoas.astro');
const api = read('functions/api/persoas-v2.js');
const admin = read('apps-script-preview/persoas-administracion.js');
const baixas = read('apps-script-preview/persoas-baixas.js');
const deleteBackend = read('apps-script-preview/persoas-alta-invitacion.js');

describe('Persoas Preview · altas, baixas e eliminación', () => {
  it('mantén unha única alta na interface', () => {
    expect(page).toContain('id="new-person-button"');
    expect(page).not.toContain('invite-person-button');
    expect(page).not.toContain('Alta por invitación');
  });

  it('separa a baixa histórica da eliminación física', () => {
    expect(page).toContain('Rexistrar baixa');
    expect(page).toContain('Eliminar rexistro da Sheet');
    expect(page).toContain("requestV2('cambiarEstadoPersoaAdministracion'");
    expect(page).toContain("requestV2('eliminarPersoaAdministracion'");
    expect(api).toContain('dataBaixa');
    expect(api).toContain('motivoBaixa');
    expect(api).toContain('observacionsBaixa');
    expect(deleteBackend).toContain('contexto.persoas.deleteRow(indiceFila + 1)');
  });

  it('rexistra as baixas na folla específica de Preview', () => {
    expect(baixas).toContain("spreadsheetId: '1S0aa-8LXpANbDWGKj9jNDB-YStTgzNHxPUbTjoZFt2w'");
    expect(baixas).toContain("sheetName: 'BaixasSocios'");
    expect(baixas).toContain("filaBaixa[ib.Socio] = idPersoa");
    expect(baixas).toContain("persoasNovoPoñer_(fila, indices, 'Activo', activo ? 'Y' : 'N')");
  });

  it('illa Persoas e UsuariosWeb de Preview das follas reais', () => {
    expect(admin).toContain("persoasSpreadsheetId: '1o45U0odJynzPXNTBhOm11_sko13Sat-_r0saZ0BjBEg'");
    expect(admin).toContain("usuariosSpreadsheetId: '1mqXN0_P21KZKPizPlPM-qM-Wx0QYxyR9T5wlObnmeA8'");
    expect(admin).not.toContain('13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ');
    expect(admin).not.toContain('1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8');
  });
});
