import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(resolve(root, 'functions/api/migrar-r2-preview.js'), 'utf8');
const appsScript = readFileSync(resolve(root, 'functions/_lib/apps-script.js'), 'utf8');

describe('Migración R2 de Preview', () => {
  it('só se executa no dominio preview', () => {
    expect(worker).toContain("const PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org'");
    expect(worker).toContain('host !== PREVIEW_HOST');
  });

  it('esixe os catro bindings R2', () => {
    expect(worker).toContain('env.R2_PUBLICO_PREVIEW');
    expect(worker).toContain('env.R2_PRIVADO_PREVIEW');
    expect(worker).toContain('env.R2_PUBLICO');
    expect(worker).toContain('env.R2_PRIVADO');
  });

  it('comproba fisicamente o illamento antes da copia', () => {
    expect(worker).toContain('__preview_migration_probe/');
    expect(worker).toContain('await destino.put(clave');
    expect(worker).toContain('await orixe.head(clave)');
    expect(worker).toContain('await destino.delete(clave)');
  });

  it('non elimina nunca do bucket de orixe', () => {
    expect(worker).not.toContain('orixe.delete(');
    expect(worker).not.toContain('orixe.put(');
  });

  it('impide fallback das accións v2 cara a Apps Script de produción', () => {
    expect(appsScript).toContain("'comprobarFotosAdministracionPortal'");
    expect(appsScript).toContain("'gardarFotoAdministracionPortal'");
  });
});
