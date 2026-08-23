import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = readFileSync(resolve(root, 'functions/api/concertos-portal-indice.js'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/portal/concertos-novo.astro'), 'utf8');
const classic = readFileSync(resolve(root, 'public/js/concertos-novo-clasico.js'), 'utf8');

describe('índice privado rápido de concertos', () => {
  it('le o índice privado de R2 tras validar a sesión', () => {
    expect(endpoint).toContain("INDEX_KEY = 'indices/concertos-privado-v1.json'");
    expect(endpoint).toContain('verificarTokenFirebase');
    expect(endpoint).toContain('env.R2_PRIVADO.get(INDEX_KEY)');
  });

  it('non toca a carga independente de asistentes', () => {
    expect(page).toContain("fetch(`/api/asistencias-concertos?t=${Date.now()}`");
    expect(page).toContain('async function cargarAsistencias');
  });

  it('concertos e carteles comparten o mesmo índice sen consultar Sheets', () => {
    expect(page).toContain("URL_INDICE_CONCERTOS = '/api/concertos-portal-indice'");
    expect(page).not.toContain('URL_PROGRAMAS');
    expect(classic).toContain("window.addEventListener('scpp:concertos-indice'");
    expect(classic).not.toContain('docs.google.com/spreadsheets');
  });
});
