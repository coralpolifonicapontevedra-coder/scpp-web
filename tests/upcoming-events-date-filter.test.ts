import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const feed = readFileSync(resolve(root, 'src/lib/concertos.ts'), 'utf8');
const homeGl = readFileSync(resolve(root, 'src/pages/index.astro'), 'utf8');
const homeEs = readFileSync(resolve(root, 'src/pages/es/index.astro'), 'utf8');

describe('eventos próximos da portada', () => {
  it('segue alimentando as dúas portadas desde o mesmo módulo', () => {
    expect(homeGl).toContain("obterConcertos()");
    expect(homeEs).toContain("obterConcertos()");
  });

  it('considera publicable un concerto previsto para a portada', () => {
    expect(feed).toContain("estadoNormalizado === 'previsto' ? 'Confirmado' : estadoOrixinal");
  });

  it('elimina automaticamente os concertos anteriores ao día actual en Madrid', () => {
    expect(feed).toContain("timeZone: 'Europe/Madrid'");
    expect(feed).toContain('dataISO(concerto.data) >= hoxe');
  });
});
