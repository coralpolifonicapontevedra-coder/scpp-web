import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(
  resolve(root, 'src/pages/portal/administracion/persoas.astro'),
  'utf8'
);
const worker = readFileSync(resolve(root, 'functions/api/persoas-v2.js'), 'utf8');

describe('rendemento de Administración de persoas', () => {
  it('reutiliza o token Firebase válido no navegador', () => {
    expect(page).toContain('user.getIdToken();');
    expect(page).not.toContain('getIdToken(true)');
  });

  it('serve a ficha desde R2 coa autorización xa cacheada', () => {
    expect(worker).toContain('function fichaDesdeCache(cacheada, idPersoa)');
    expect(worker).toContain("return servirFicha(env, fichaCacheada, 0, 'CACHE')");
    expect(worker).toContain("'X-SCPP-Authorization', autorizacion");
  });

  it('mantén Apps Script como respaldo cando non hai cache', () => {
    const direct = worker.indexOf("return servirFicha(env, fichaCacheada, 0, 'CACHE')");
    const fallback = worker.indexOf('const inicioAppsScript = Date.now();', direct);
    expect(direct).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(direct);
  });

  it('só acepta claves do prefixo privado de fichas', () => {
    expect(worker).toContain("key.startsWith('persoas/fichas/')");
    expect(worker).toContain("persoa.fichaR2Estado || '').trim() !== 'SINCRONIZADO'");
  });
});
