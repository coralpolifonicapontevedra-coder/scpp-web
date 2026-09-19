import { describe, expect, it } from 'vitest';
import {
  concertosPrivadosIndexSchema,
  ensaiosIndexSchema,
  fotosRevisionIndexSchema,
  persoaSchema,
  persoasIndexSchema,
  obraRepertorioSchema,
  repertorioIndexSchema,
  resumirErroIndice,
  validarIndice
} from '../functions/_lib/index-schemas.js';

describe('contratos dos índices R2', () => {
  it('acepta o payload v2 actual de ensaios', () => {
    const result = validarIndice(ensaiosIndexSchema, {
      ok: true,
      version: 2,
      perfil: { email: 'proba@example.com' },
      ensaios: [{ id: 'E-1', data: '2026-09-02' }],
      persoas: [{ id: 'P-1', nome: 'Persoa' }],
      asistencias: [],
      ensaiosRepertorio: [],
      repertorio: [],
      concertos: [],
      seguimento: {},
      xeradoEn: '2026-08-19T07:00:00.000Z'
    });

    expect(result.success).toBe(true);
  });

  it('rexeita un índice de ensaios coa versión incorrecta', () => {
    const result = validarIndice(ensaiosIndexSchema, {
      ok: true,
      version: 1,
      ensaios: [],
      persoas: []
    });

    expect(result.success).toBe(false);
    expect(resumirErroIndice(result)).toContain('version');
  });

  it('rexeita ensaios sen as listas estruturais obrigatorias', () => {
    expect(ensaiosIndexSchema.safeParse({ ok: true, version: 2 }).success).toBe(false);
  });

  it('acepta as variantes actuais do repertorio', () => {
    expect(repertorioIndexSchema.safeParse({ ok: true, obras: [] }).success).toBe(true);
    expect(repertorioIndexSchema.safeParse({ repertorio: [] }).success).toBe(true);
    expect(repertorioIndexSchema.safeParse({ datos: [] }).success).toBe(true);
  });

  it('rexeita repertorio sen ningunha colección de obras', () => {
    expect(repertorioIndexSchema.safeParse({ ok: true }).success).toBe(false);
  });

  it('acepta campos coñecidos de repertorio e conserva extensións futuras', () => {
    const result = obraRepertorioSchema.safeParse({
      idRepertorio: 'R-1',
      nomeObra: 'Ave Maria',
      autor: 'Autor',
      audios: [{ voz: 'Tenores' }],
      campoNovo: 'compatible'
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.campoNovo).toBe('compatible');
  });

  it('rexeita tipos claramente incorrectos nos campos coñecidos de repertorio', () => {
    expect(obraRepertorioSchema.safeParse({ idRepertorio: 123 }).success).toBe(false);
    expect(obraRepertorioSchema.safeParse({ audios: 'non-é-unha-lista' }).success).toBe(false);
  });

  it('acepta campos coñecidos dunha persoa sen pechar o contrato a novos campos', () => {
    const result = persoaSchema.safeParse({
      Id: 'P-1',
      Nome: 'Persoa',
      Apelidos: 'de Proba',
      Voz: 'Tenor',
      Cargo: 'Secretario/a',
      DataIncorporacion: '2024-01-15',
      campoNovo: 'compatible'
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.campoNovo).toBe('compatible');
  });

  it('rexeita tipos claramente incorrectos nos campos coñecidos de persoas', () => {
    expect(persoaSchema.safeParse({ Id: 57 }).success).toBe(false);
    expect(persoaSchema.safeParse({ Voz: ['Tenor'] }).success).toBe(false);
  });

  it('valida a estrutura mínima dos índices de persoas, concertos e fotos', () => {
    expect(persoasIndexSchema.safeParse({ persoas: [] }).success).toBe(true);
    expect(concertosPrivadosIndexSchema.safeParse({ ok: true, concertos: [] }).success).toBe(true);
    expect(fotosRevisionIndexSchema.safeParse({ ok: true, fotos: [] }).success).toBe(true);
  });

  it('mantén campos adicionais para facilitar unha migración progresiva', () => {
    const result = ensaiosIndexSchema.safeParse({
      ok: true,
      version: 2,
      ensaios: [],
      persoas: [],
      campoNovo: 'compatible'
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.campoNovo).toBe('compatible');
  });
});
