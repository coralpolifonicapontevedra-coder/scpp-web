import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const individual = readFileSync('functions/api/persoas-revision.js', 'utf8');
const masiva = readFileSync('functions/api/persoas-revision-masiva.js', 'utf8');

describe('texto legal das revisións de Persoas', () => {
  it('comparte unha única caché R2 para DATOS_PERSOA_SCPP', () => {
    for (const source of [individual, masiva]) {
      expect(source).toContain("const LEGAL_ID = 'DATOS_PERSOA_SCPP'");
      expect(source).toContain("const LEGAL_CACHE_KEY = 'persoas/textos-legais/DATOS_PERSOA_SCPP.json'");
      expect(source).toContain('const LEGAL_CACHE_TTL_MS = 30 * 60 * 1000');
      expect(source).toContain('async function lerTextoLegalCache(env)');
      expect(source).toContain('async function gardarTextoLegalCache(env, textoLegal)');
    }
  });

  it('a revisión individual non pide TextosLegais cando a caché está quente', () => {
    expect(individual).toContain('const legalCache = await lerTextoLegalCache(env)');
    expect(individual).toContain('incluirTextoLegalPersoas: !legalCache');
    expect(individual).toContain('const textoLegal = legalCache || textoLegalValido(authData.listado?.textoLegalPersoas)');
  });

  it('a revisión masiva resolve o texto legal aínda que persoas-v2 non o devolva', () => {
    expect(masiva).toContain('async function obterTextoLegalPersoas(env, user)');
    expect(masiva).toContain("accion: 'listarPersoasAdministracion'");
    expect(masiva).toContain('incluirTextoLegalPersoas: true');
    expect(masiva).toContain('textoLegal = await obterTextoLegalPersoas(env, authData.user)');
  });

  it('non altera o rexistro final da aceptación individual', () => {
    expect(individual).toContain("accion: 'actualizarPersoaAdministracion'");
    expect(individual).toContain('aceptaFines: true');
    expect(individual).toContain("if (!result?.aceptacion?.rowId) throw new Error('O backend non confirmou o rexistro na táboa Aceptación.');");
  });
});
