import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/push-apps-script-preview.yml', 'utf8');

describe('texto legal rápido nas revisións de Persoas', () => {
  it('non carga a listaxe completa de Persoas para obter DATOS_PERSOA_SCPP', () => {
    expect(workflow).toContain("accion === 'listarPersoasAdministracion' && datos.incluirTextoLegalPersoas === true");
    expect(workflow).toContain('resultadoTextoLegalPersoas = obterTextoLegalPersoasAdministracion_(datos)');
    expect(workflow).not.toContain('resultadoPersoasLegal = listarPersoasAdministracion_(datos)');
    expect(workflow).toContain("perfil: { nivel: 'Administración'");
    expect(workflow).toContain('textoLegalPersoas: resultadoTextoLegalPersoas.textoLegal');
  });
});
