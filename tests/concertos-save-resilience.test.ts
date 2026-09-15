import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = readFileSync(resolve(root, 'functions/api/concertos-admin-gardar.js'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/portal/administracion/concertos.astro'), 'utf8');

describe('gardado resiliente de concertos', () => {
  it('non converte nun falso 502 un fallo de R2 posterior ao gardado na Sheet', () => {
    expect(api).toContain('actualizarIndiceConReintento');
    expect(api).toContain('O concerto gardouse na Sheet pero fallou a sincronización R2.');
    expect(api).toContain('sincronizacionR2');
    expect(api).toContain("aviso:sincronizacionR2.ok");
    expect(api).toContain("return json(200, {");
  });

  it('distingue a etapa de Apps Script para os erros reais de gardado', () => {
    expect(api).toContain("etapa:'APPS_SCRIPT'");
    expect(api).toContain('appsScriptMs');
    expect(api).toContain('r2Ms');
    expect(api).toContain('totalMs');
  });

  it('mantén a protección contra dobres gardados no formulario', () => {
    expect(page).toContain('submit.disabled');
    expect(page).toContain("accion==='gardarConcerto'?'/api/concertos-admin-gardar'");
  });
});
