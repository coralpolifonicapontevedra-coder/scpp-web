import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const homeGl = readFileSync(resolve(root, 'src/pages/index.astro'), 'utf8');
const homeEs = readFileSync(resolve(root, 'src/pages/es/index.astro'), 'utf8');
const agendaGl = readFileSync(resolve(root, 'src/pages/axenda.astro'), 'utf8');
const agendaEs = readFileSync(resolve(root, 'src/pages/es/agenda.astro'), 'utf8');

const pages = [homeGl, homeEs, agendaGl, agendaEs];

describe('eventos próximos', () => {
  it('acepta eventos previstos e confirmados', () => {
    for (const page of pages) {
      expect(page).toContain("'previsto'");
      expect(page).toContain("'confirmado'");
    }
  });

  it('exclúe das listas de próximos os eventos anteriores á data actual', () => {
    for (const page of pages) {
      expect(page).toContain("timeZone: 'Europe/Madrid'");
      expect(page).toMatch(/dataISO\([^)]*\.data\)\s*>=\s*hoxe|dataISO\([^)]*\.data\)\s*>=\s*hoy/);
    }
  });
});
