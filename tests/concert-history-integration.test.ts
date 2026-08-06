import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const route = readFileSync(resolve(root, 'functions/portal/concertos/index.js'), 'utf8');
const privatePage = readFileSync(resolve(root, 'src/pages/portal/concertos-novo.astro'), 'utf8');
const publicPage = readFileSync(resolve(root, 'src/pages/historico-concertos.astro'), 'utf8');
const publicStyles = readFileSync(resolve(root, 'src/styles/historico-concertos-global.css'), 'utf8');
const homePage = readFileSync(resolve(root, 'src/pages/index.astro'), 'utf8');
const publicHero = readFileSync(resolve(root, 'src/components/PublicPageHero.astro'), 'utf8');

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
    expect(privatePage).toContain('<details class="history-period"');
    expect(privatePage).toContain('name="periodos-historicos-privados"');
    expect(publicPage).toContain("const endpoint = '/api/concertos-historico'");
    expect(publicPage).toContain('const exactYear = /^\\d{4}$/.test(query)');
    expect(publicPage).toContain('<details class="period-block"');
    expect(publicPage).toContain('name="periodos-historicos"');
    expect(publicPage).toContain('class="period-toggle"');
  });

  it('aplica viñetas alternas e unha táboa coidada', () => {
    expect(publicStyles).toContain('.period-block:nth-child(odd):not([open])');
    expect(publicStyles).toContain('linear-gradient(135deg,#681426,#861b38)');
    expect(publicStyles).toContain('.period-block[open]');
    expect(publicStyles).toContain('grid-column:1/-1');
    expect(publicStyles).toContain('.history-table');
    expect(publicStyles).toContain('table-layout:fixed');
  });

  it('presenta os campos separados e evita repetir o número do concerto', () => {
    for (const page of [privatePage, publicPage]) {
      expect(page).toContain('<th>Nº</th><th>Data</th><th>Localidade</th><th>Lugar</th><th>Descrición</th>');
      expect(page).toContain('data-label="Nº"');
      expect(page).toContain('nomeXenerico');
      expect(page).toContain('<table class="history-table">');
      expect(page).not.toContain('data-history-id');
    }
  });

  it('publica o PDF oficial para consulta e descarga', () => {
    const pdf = '/documentos/Concertos_SCPP_1925_2026.pdf';
    expect(publicPage).toContain(pdf);
    expect(publicPage).toContain('Consultar documento');
    expect(publicPage).toContain('Descargar documento');
  });

  it('integra o acceso público sen destacar o histórico na portada', () => {
    expect(homePage).not.toContain('class="history-cta');
    expect(homePage).toContain('<a href="/historia/">Un século de historia</a>');
    expect(publicHero).toContain('class="public-page-hero__history-link" href="/historico-concertos/"');
    expect(publicHero).toContain('Histórico de concertos');
    expect(publicHero).toContain('{eHistoria && (');
  });
});
