import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = readFileSync(resolve(root, 'functions/api/concertos-portal-indice.js'), 'utf8');
const publicEndpoint = readFileSync(resolve(root, 'functions/api/concertos-indice.js'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/portal/concertos-novo.astro'), 'utf8');
const classic = readFileSync(resolve(root, 'public/js/concertos-novo-clasico.js'), 'utf8');

describe('índices rápidos de concertos por contorno', () => {
  it('le o índice privado correcto de main ou preview tras validar a sesión', () => {
    expect(endpoint).toContain("INDEX_KEY_MAIN = 'indices/concertos-privado-v1.json'");
    expect(endpoint).toContain("INDEX_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json'");
    expect(endpoint).toContain('verificarTokenFirebase');
    expect(endpoint).toContain('env.R2_PRIVADO.get(key)');
  });

  it('mantén no portal os concertos actuais numerados e reserva hist-* para o histórico', () => {
    expect(endpoint).toContain("const historico = id.startsWith('hist-');");
    expect(endpoint).not.toContain('Boolean(clean(concerto.numeroConcerto))');
    expect(endpoint).toContain("new Set(['previsto', 'confirmado', 'realizado'])");
  });

  it('normaliza os identificadores de repertorio escritos pola administración', () => {
    expect(endpoint).toContain('const idObra = clean(item?.id || item?.idRepertorio);');
    expect(endpoint).toContain('id: idObra');
    expect(endpoint).toContain('idRepertorio: clean(item?.idRepertorio || item?.id)');
    expect(page).toContain('href="/portal/repertorio/?id=${encodeURIComponent(p.id)}"');
  });

  it('illa a Axenda de Preview do índice público de main', () => {
    expect(publicEndpoint).toContain("INDEX_KEY_MAIN = 'indices/concertos-v1.json'");
    expect(publicEndpoint).toContain("INDEX_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json'");
    expect(publicEndpoint).toContain('const bucket = preview ? env.R2_PRIVADO : env.R2_PUBLICO;');
    expect(publicEndpoint).toContain('concerto?.mostrarWeb === true');
    expect(publicEndpoint).toContain("['previsto', 'confirmado', 'realizado']");
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
