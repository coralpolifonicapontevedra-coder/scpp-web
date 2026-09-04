import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('apps-script-production-head/persoas-administracion.js', 'utf8');

describe('candidato Apps Script de Persoas', () => {
  it('inclúe o texto legal específico de Persoas', () => {
    expect(source).toContain("PERSOAS_TEXTO_LEGAL_ID_ = 'DATOS_PERSOA_SCPP'");
    expect(source).toContain('incluirTextoLegalPersoas');
    expect(source).toContain('obterTextoLegalPersoasAdmin_');
  });

  it('conserva creación, actualización e consulta de ficha', () => {
    expect(source).toContain('function crearPersoaAdministracion_');
    expect(source).toContain('function actualizarPersoaAdministracion_');
    expect(source).toContain('function obterFichaPersoaAdministracion_');
  });
});
