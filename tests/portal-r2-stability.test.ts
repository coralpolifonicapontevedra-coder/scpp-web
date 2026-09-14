import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const portal = read('src/pages/portal.astro');
const acceptance = read('functions/api/aceptacion.js');
const permissionLib = read('functions/_lib/portal-permissions.js');
const permissionApi = read('functions/api/permisos.js');

describe('Portal R2-first stability', () => {
  it('non forza unha renovación Firebase en cada entrada e non pecha sesión por erros transitorios', () => {
    expect(portal).not.toContain('getIdToken(true)');
    expect(portal).toContain("if (status === 401 || status === 403)");
    expect(portal).toContain('Tentaremos de novo automaticamente.');
    expect(portal).toContain('A sesión segue activa');
  });

  it('usa R2 como resposta operativa da aceptación e refresca en segundo plano', () => {
    expect(acceptance).toContain("const CACHE_ACEPTACION_FRESCA_MS = 60 * 60 * 1000");
    expect(acceptance).toContain("const CACHE_ACEPTACION_RESPALDO_MS = 30 * 24 * 60 * 60 * 1000");
    expect(acceptance).toContain("'R2-STALE-WHILE-REVALIDATE'");
    expect(acceptance).toContain("if (typeof context.waitUntil === 'function') context.waitUntil(tarefa)");
    expect(acceptance).toContain('estadoPersoaR2');
  });

  it('separa permisos de preview e produción e permite invalidación selectiva', () => {
    expect(permissionLib).toContain("const CACHE_R2_MS = 24 * 60 * 60 * 1000");
    expect(permissionLib).toContain("const R2_PREFIX = 'permisos/cache-v2/'");
    expect(permissionLib).toContain("ramaActual(env)");
    expect(permissionLib).toContain('export async function invalidarPermisosPortal');
    expect(permissionLib).not.toContain('const CACHE_MS = 2 * 60 * 1000');
  });

  it('serve a xestión de permisos desde R2 e rexenera tras escrituras', () => {
    expect(permissionApi).toContain("const LIST_CACHE_PREFIX = 'permisos/xestion-cache-v1/'");
    expect(permissionApi).toContain("'X-SCPP-Permissions-Source'");
    expect(permissionApi).toContain('await invalidarPermisosPortal(env, destinatario, modulos)');
    expect(permissionApi).toContain('await borrarCacheListado(env)');
    expect(permissionApi).toContain('refrescarListado(env, user, contextoPersoas)');
  });
});
