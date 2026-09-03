import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/portal/administracion/concertos.astro', 'utf8');

describe('carga inicial rápida de Administración de Concertos', () => {
  it('reutiliza unha caché curta ligada ao mesmo usuario', () => {
    expect(source).toContain("LIST_CACHE_KEY='scpp-admin-concertos-list-v1'");
    expect(source).toContain('LIST_CACHE_TTL=60*1000');
    expect(source).toContain("sameUser=String(cached?.email||'').toLowerCase()===String(email||'').toLowerCase()");
  });

  it('mantén a validación real no servidor e refresca despois de pintar a caché', () => {
    expect(source).toContain("const result=await request('listar')");
    expect(source.indexOf('const cached=readListCache(user.email)')).toBeLessThan(source.indexOf("const result=await request('listar')"));
    expect(source).toContain("clearListCache();if(loading instanceof HTMLElement)loading.hidden=true");
  });

  it('borra a caché ao pechar a sesión', () => {
    expect(source).toContain("clearListCache();await closePortalSession()");
  });
});
