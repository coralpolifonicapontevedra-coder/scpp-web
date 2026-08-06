import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const route = readFileSync(resolve(root, 'functions/portal/concertos/index.js'), 'utf8');
const privatePage = readFileSync(resolve(root, 'src/pages/portal/concertos-novo.astro'), 'utf8');
const publicPage = readFileSync(resolve(root, 'src/pages/historico-concertos.astro'), 'utf8');

describe('histórico de concertos activo', () => {
  it('proba a implementación que realmente serve a ruta oficial', () => {
    expect(route).toContain("const RUTA_IMPLEMENTACION = '/portal/concertos-novo/'");
    expect(privatePage).toContain('id="ver-historico"');
    expect(privatePage).toContain('let todosConcertos = []');
  });

  it('limita a grella principal a Mostrar_Web sen reducir o informe', () => {
    expect(privatePage).toContain("mostrarWeb:verdadeiro(valor(r,'Mostrar_Web'))");
    expect(privatePage).toContain('concertos = todosConcertos.filter((c) => c.mostrarWeb');
    expect(privatePage).toContain('todosConcertos.forEach((c) => (c.asistentes');
  });

  it('ofrece o arquivo completo por décadas nas dúas áreas', () => {
    expect(privatePage).toContain('function pintarHistorico()');
    expect(privatePage).toContain('class="history-period"');
    expect(publicPage).toContain("const endpoint = '/api/concertos-historico'");
    expect(publicPage).toContain('const exactYear = /^\\d{4}$/.test(query)');
    expect(publicPage).toContain('class="period-block"');
  });

  it('presenta os campos separados e evita repetir o número do concerto', () => {
    for (const page of [privatePage, publicPage]) {
      expect(page).toContain('<th>Nº</th><th>Data</th><th>Localidade</th><th>Lugar</th><th>Descrición</th>');
      expect(page).toContain('data-label="Nº"');
      expect(page).toContain('nomeXenerico');
      expect(page).not.toContain('data-history-id');
    }
  });

  it('publica a descarga documental desde as dúas áreas', () => {
    const download = '/documentos/historico-concertos-scpp-1925-2026.docx';
    expect(privatePage).toContain(download);
    expect(publicPage).toContain(download);
  });
});
