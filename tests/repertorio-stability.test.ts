import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const middleware = readFileSync(resolve(root, 'functions/portal/repertorio/_middleware.js'), 'utf8');
const api = readFileSync(resolve(root, 'functions/api/repertorio.js'), 'utf8');
const directLoader = readFileSync(resolve(root, 'public/js/repertorio-direct-api.js'), 'utf8');
const bridge = readFileSync(resolve(root, 'public/js/repertorio-r2-bridge.js'), 'utf8');

describe('estabilidade do Repertorio privado', () => {
  it('mantén o cargador completo antes da ponte de presentación', () => {
    const direct = middleware.indexOf('/js/repertorio-direct-api.js');
    const r2Bridge = middleware.indexOf('/js/repertorio-r2-bridge.js');

    expect(direct).toBeGreaterThanOrEqual(0);
    expect(r2Bridge).toBeGreaterThan(direct);
  });

  it('enriquece o catálogo co índice R2 e serve R2 antes do respaldo Drive', () => {
    expect(api).toContain("import { REPERTORIO_R2 } from '../_data/repertorio-r2.js'");
    expect(api).toContain('incorporarIndiceCompleto');
    expect(api).toContain('return await respostaR2(env, clave)');
    expect(api.indexOf('return await respostaR2(env, clave)')).toBeLessThan(
      api.indexOf('await obterJsonAppsScript(')
    );
  });

  it('intercepta a carga completa autenticada e conserva a caché local', () => {
    expect(directLoader).toContain("accion === 'listarRepertorioPortal'");
    expect(directLoader).toContain('localStorage');
    expect(directLoader).toContain('/api/repertorio');
  });

  it('invalida versións antigas para non mostrar obras sen recursos', () => {
    expect(bridge).toContain('scpp:repertorio:completo:v2');
    expect(bridge).toContain('scpp:repertorio:completo:v3');
    expect(bridge).toContain('scpp:repertorio:completo:v4');
  });
});
