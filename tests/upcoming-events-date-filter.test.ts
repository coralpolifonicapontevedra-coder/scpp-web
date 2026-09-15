import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/concertos-indice.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const feed = readFileSync(resolve(root, 'src/lib/concertos.ts'), 'utf8');
const homeGl = readFileSync(resolve(root, 'src/pages/index.astro'), 'utf8');
const homeEs = readFileSync(resolve(root, 'src/pages/es/index.astro'), 'utf8');

describe('eventos próximos da portada', () => {
  it('segue alimentando as dúas portadas desde o mesmo módulo', () => {
    expect(homeGl).toContain("obterConcertos()");
    expect(homeEs).toContain("obterConcertos()");
  });

  it('publica previstos futuros desde R2 e exclúe previstos pasados', async () => {
    const concertos = [
      { id: 'futuro', nome: 'Futuro', data: '2099-01-01', estado: 'Previsto' },
      { id: 'pasado', nome: 'Pasado', data: '2000-01-01', estado: 'Previsto' },
    ];
    const response = await onRequest({
      request: new Request('https://example.org/api/concertos-indice'),
      env: { R2_PUBLICO: { get: async () => ({
        json: async () => ({ ok: true, version: 1, concertos }),
      }) } },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.concertos).toEqual([
      { ...concertos[0], estado: 'Confirmado', estadoPublicoOrixinal: 'Previsto' },
    ]);
  });

  it('elimina automaticamente os concertos anteriores ao día actual en Madrid', () => {
    expect(feed).toContain("timeZone: 'Europe/Madrid'");
    expect(feed).toContain('dataISO(concerto.data) >= hoxe');
  });
});
