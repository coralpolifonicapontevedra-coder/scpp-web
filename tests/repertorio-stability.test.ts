import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const middleware = readFileSync(resolve(root, 'functions/portal/repertorio/_middleware.js'), 'utf8');
const api = readFileSync(resolve(root, 'functions/api/repertorio.js'), 'utf8');
const cacheApi = readFileSync(resolve(root, 'functions/api/repertorio-cache-v2.js'), 'utf8');
const directLoader = readFileSync(resolve(root, 'public/js/repertorio-direct-api.js'), 'utf8');
const bridge = readFileSync(resolve(root, 'public/js/repertorio-r2-bridge.js'), 'utf8');

describe('estabilidade do Repertorio privado', () => {
  it('mantén o cargador completo antes da ponte de presentación', () => {
    const direct = middleware.indexOf('/js/repertorio-direct-api.js');
    const r2Bridge = middleware.indexOf('/js/repertorio-r2-bridge.js');

    expect(direct).toBeGreaterThanOrEqual(0);
    expect(r2Bridge).toBeGreaterThan(direct);
  });

  it('serve os ficheiros de R2 antes do respaldo Drive', () => {
    expect(api).toContain('return await respostaR2(env, clave)');
    expect(api.indexOf('return await respostaR2(env, clave)')).toBeLessThan(
      api.indexOf('await obterJsonAppsScript(')
    );
  });

  it('sincroniza Sheets cara a un catálogo R2 e usa R2Key para os recursos', () => {
    expect(cacheApi).toContain("accion: 'listarRepertorioAdministracion'");
    expect(cacheApi).toContain("'repertorio/cache/catalogo.json'");
    expect(cacheApi).toContain('row.R2Key');
    expect(cacheApi).toContain('truth(row.Activa)');
    expect(cacheApi).toContain('truth(row.Activo)');
    expect(cacheApi).toContain('writeJson(env.R2_PRIVADO, key, catalogo)');
  });

  it('intercepta a carga completa autenticada e conserva unha caché local curta', () => {
    expect(directLoader).toContain("body?.accion === 'listarRepertorioPortal'");
    expect(directLoader).toContain('localStorage');
    expect(directLoader).toContain('/api/repertorio-cache-v2');
  });

  it('invalida as versións locais antigas sen eliminar a versión nova', () => {
    expect(bridge).toContain('scpp:repertorio:completo:v2');
    expect(bridge).toContain('scpp:repertorio:completo:v3');
    expect(bridge).toContain('scpp:repertorio:completo:v4');
    expect(bridge).toContain('scpp:repertorio:completo:v5');
    expect(bridge).not.toContain("'scpp:repertorio:completo:v6',");
  });
});
