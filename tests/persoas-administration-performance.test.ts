import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const controller = readFileSync(resolve(root, 'src/lib/persoas-admin-v4.js'), 'utf8');
const worker = readFileSync(resolve(root, 'functions/api/persoas-v2.js'), 'utf8');

describe('rendemento de Administración de persoas', () => {
  it('reutiliza o token Firebase válido no navegador', () => {
    expect(controller).toContain('return user.getIdToken();');
    expect(controller).not.toContain('getIdToken(true)');
  });

  it('serve a ficha desde R2 aproveitando o snapshot operativo', () => {
    expect(worker).toContain('async function lerSnapshot(env)');
    expect(worker).toContain('const snapshot = force ? null : await lerSnapshot(env);');
    expect(worker).toContain('return servirFicha(env, persoa);');
    expect(worker).toContain("headers.set('X-SCPP-Storage', 'R2');");
  });

  it('mantén Apps Script como respaldo cando non hai snapshot válido', () => {
    expect(worker).toContain("return { payload: await consultarListado(env, user, permission), fonte: 'SHEET+R2', savedAt: Date.now() };");
    expect(worker).toContain("const result = await chamarAppsScript(env, user, 'persoasV2Listar');");
  });

  it('só acepta fichas sincronizadas baixo o prefixo privado', () => {
    expect(worker).toContain("key.startsWith('persoas/fichas/')");
    expect(worker).toContain("clean(persoa?.fichaR2Estado) !== 'SINCRONIZADO'");
    expect(worker).toContain('persoa?.fichaDisponibleR2 !== true');
  });
});
