import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lib = readFileSync(resolve(root, 'src/lib/concertos.ts'), 'utf8');
const api = readFileSync(resolve(root, 'functions/api/concertos-indice.js'), 'utf8');
const save = readFileSync(resolve(root, 'functions/api/concertos-admin-gardar.js'), 'utf8');

describe('axenda pública rápida e coherente', () => {
  it('a portada le o mesmo índice R2 que a axenda e non tres CSV de Google', () => {
    expect(lib).toContain("fetch('/api/concertos-indice'");
    expect(lib).not.toContain('docs.google.com/spreadsheets');
  });

  it('o índice público admite previsto futuro e evita cache obsoleta', () => {
    expect(api).toContain("['previsto', 'confirmado', 'realizado', 'aprazado', 'aplazado']");
    expect(api).toContain("'Cache-Control': 'no-store'");
    expect(api).toContain("estadoPublicoOrixinal: 'Previsto'");
  });

  it('o gardado actualiza tamén o índice público de produción', () => {
    expect(save).toContain("PUBLIC_INDEX_MAIN = 'indices/concertos-v1.json'");
    expect(save).toContain('actualizarIndicePublico');
    expect(save).toContain('env.R2_PUBLICO.put(PUBLIC_INDEX_MAIN');
  });
});
