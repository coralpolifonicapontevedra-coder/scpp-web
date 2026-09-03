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
      expect(source).toContain('async function obterTextoLegalPersoas(env, user)');
    }
  });

  it('a revisión individual usa Persoas v2 para a listaxe e R2 para o texto legal', () => {
    expect(individual).toContain("const listUrl = new URL('/api/persoas-v2', context.request.url)");
    expect(individual).toContain("body: JSON.stringify({ idToken: data.idToken, accion: 'listarPersoasAdministracion' })");
    expect(individual).toContain('textoLegal = await obterTextoLegalPersoas(env, authData.user)');
  });

  it('o texto legal só volve a Apps Script cando a caché non existe ou caducou', () => {
    for (const source of [individual, masiva]) {
      expect(source).toContain('const cache = await lerTextoLegalCache(env)');
      expect(source).toContain('if (cache) return cache');
      expect(source).toContain('incluirTextoLegalPersoas: true');
    }
  });

  it('a revisión masiva resolve o texto legal aínda que persoas-v2 non o devolva', () => {
    expect(masiva).toContain('textoLegal = await obterTextoLegalPersoas(env, authData.user)');
    expect(masiva).not.toContain('textoLegalValido(authData.listado?.textoLegalPersoas)');
  });

  it('non altera o rexistro final da aceptación individual', () => {
    expect(individual).toContain("accion: 'actualizarPersoaAdministracion'");
    expect(individual).toContain('aceptaFines: true');
    expect(individual).toContain("if (!result?.aceptacion?.rowId) throw new Error('O backend non confirmou o rexistro na táboa Aceptación.');");
  });
});
