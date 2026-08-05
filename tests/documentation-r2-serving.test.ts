import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(resolve(root, 'functions/api/documentacion.js'), 'utf8');

describe('servicio de Documentación desde R2', () => {
  it('deriva claves privadas para documentos y actas', () => {
    expect(worker).toContain("'documentacion/actas'");
    expect(worker).toContain("'documentacion/documentos'");
    expect(worker).toContain('slugR2(id)');
    expect(worker).toContain('slugR2(nome)');
  });

  it('autoriza contra el listado del servidor antes de leer R2', () => {
    const authorization = worker.indexOf('buscarDocumentoAutorizado(payload, datos)');
    const r2 = worker.indexOf('await respostaR2(env, documento)', authorization);
    expect(authorization).toBeGreaterThan(-1);
    expect(r2).toBeGreaterThan(authorization);
    expect(worker).not.toContain('datos.r2Key');
  });

  it('sirve R2 como origen principal con cabeceras privadas', () => {
    expect(worker).toContain("env.R2_PRIVADO.get(key)");
    expect(worker).toContain("'X-SCPP-Storage', 'R2'");
    expect(worker).toContain("'Cache-Control', 'private, max-age=3600'");
  });

  it('mantiene Drive y Apps Script solamente como respaldo transitorio', () => {
    const r2 = worker.indexOf('await respostaR2(env, documento)');
    const fallback = worker.indexOf('const { resultado, usouRespaldo } = await obterJsonAppsScript(', r2);
    expect(r2).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(r2);
    expect(worker).toContain("'X-SCPP-Storage': 'DRIVE_APPS_SCRIPT'");
    expect(worker).toContain("'X-SCPP-R2', 'FALLBACK'");
  });
});
