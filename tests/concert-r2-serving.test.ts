import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(resolve(root, 'functions/_data/concert-media-r2.js'), 'utf8');
const route = readFileSync(resolve(root, 'functions/media/concertos/[nome].js'), 'utf8');
const api = readFileSync(resolve(root, 'functions/api/concertos.js'), 'utf8');
const axenda = readFileSync(resolve(root, 'src/pages/axenda.astro'), 'utf8');

describe('servizo R2 de materiais de concertos', () => {
  it('mantén un índice pechado e deduplicado', () => {
    expect(index).toContain('CONCERT_MEDIA_BY_NAME');
    expect(index.match(/d91193d873671df0dd549298428ce378/g)?.length).toBe(2);
    expect(index).not.toContain('3a712692398358989dcda3b20888612a');
  });

  it('serve só nomes coñecidos desde R2 e conserva respaldo de Pages', () => {
    expect(route).toContain('concertMediaByName(nome)');
    expect(route).toContain("env.R2_PRIVADO.get(entrada.r2Key");
    expect(route).toContain("X-SCPP-Storage', 'R2");
    expect(route).toContain('PAGES-FALLBACK');
  });

  it('usa R2 para programas autenticados antes de Apps Script', () => {
    expect(api).toContain('CONCERT_PROGRAM_BY_ID');
    expect(api).toContain('respostaProgramaR2');
    expect(api.indexOf('const programaR2 = await respostaProgramaR2')).toBeLessThan(
      api.indexOf('const { resultado, usouRespaldo } = await obterJsonAppsScript')
    );
  });

  it('publica carteles, trípticos e prensa mediante o endpoint controlado', () => {
    expect(axenda).toContain('/media/concertos/');
    expect(axenda).not.toContain("if (tipo === 'cartel') return `/img/concertos/");
  });
});

