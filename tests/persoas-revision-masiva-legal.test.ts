import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('functions/api/persoas-revision-masiva.js', 'utf8');

describe('revisión masiva de Persoas', () => {
  it('non depende de textoLegalPersoas devolto por persoas-v2', () => {
    expect(source).toContain('textoLegal = await obterTextoLegalPersoas(env, authData.user)');
    expect(source).not.toContain('textoLegalValido(authData.listado?.textoLegalPersoas)');
  });

  it('mantén a carga de persoas desde persoas-v2', () => {
    expect(source).toContain("const listUrl = new URL('/api/persoas-v2', context.request.url)");
    expect(source).toContain("accion: 'listarPersoasAdministracion'");
  });
});
