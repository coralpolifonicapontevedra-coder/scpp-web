import { describe, expect, it, vi, afterEach } from 'vitest';
import { construirCatalogo, onRequest } from '../functions/api/repertorio-cache-v2.js';
import { REPERTORIO_R2 } from '../functions/_data/repertorio-r2.js';

const catalog = (partituras = [], audios = [], id = '28') => construirCatalogo({
  obras: [{ Id: id, NomeObra: 'Obra' }], partituras, audios
}, null, null).obras[0];
afterEach(() => vi.unstubAllGlobals());

describe('Sheets control active repertoire resources', () => {
  it.each([['28', '86'], ['78', '93']])('keeps the additional score %s/%s missing from the bundled index', (work, id) => {
    const result = catalog([{ Id_Repertorio: work, Id_Partitura: id, Activa: 'Y', R2Key: 'partituras/new.pdf' }], [], work);
    expect(result.partituras.map(x => x.id)).toEqual([id]);
  });
  it('does not resurrect indexed scores or audio when deleted or inactive', () => {
    const score = REPERTORIO_R2['6'].partituras[0];
    const audio = REPERTORIO_R2['6'].audios[0];
    const result = catalog([{ Id_Repertorio: '6', Id_Partitura: score.id, Activa: 'N' }],
      [{ NomeObra: '6', Id_Audio: audio.id, Activo: 'N' }], '6');
    expect(result.partituras).toEqual([]);
    expect(result.audios).toEqual([]);
    expect(catalog([], [], '6').tenRecursosR2).toBe(false);
  });
  it('preserves new audio and current metadata and explicit storage keys', () => {
    const old = REPERTORIO_R2['6'].audios[0];
    const result = catalog([], [
      { NomeObra: '06', Id_Audio: old.id, Activo: 'Y', Voz: 'New voice', R2Key: 'repertorio/audios/6/replaced.mp3' },
      { NomeObra: '06', Id_Audio: '999', Activo: 'Y', R2Key: 'repertorio/audios/6/new.mp3' }
    ], '06');
    expect(result.audios).toHaveLength(2);
    expect(result.audios.find(x => x.id === old.id)).toMatchObject({ voz: 'New voice', r2Key: 'repertorio/audios/6/replaced.mp3' });
  });
  it('retains the morning legacy path repair only for matching IDs in the same work', () => {
    const old = REPERTORIO_R2['6'].audios[0];
    const result = catalog([], [{ NomeObra: '06', Id_Audio: old.id, Activo: 'Y', Voz: 'Current voice' }], '6');
    expect(result.audios[0]).toMatchObject({ r2Key: old.r2Key, voz: 'Current voice' });
    expect(catalog([], [{ NomeObra: '89', Id_Audio: old.id, Activo: 'Y' }], '89').audios).toEqual([]);
  });
  it('does not serve old merged caches, including when Sheets is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('identitytoolkit')) return Response.json({ users: [{ email: 'test@example.org', emailVerified: true, localId: 'test' }] });
      throw new Error('Sheets unavailable');
    }));
    const old = { ok: true, obras: [], cacheMeta: { savedAt: Date.now(), version: 'repertorio-cache-v2' } };
    const response = await onRequest({
      request: new Request('https://example.org/api/repertorio-cache-v2', { method: 'POST', body: JSON.stringify({ idToken: 'test' }) }),
      env: { CF_PAGES_BRANCH: 'main', FIREBASE_API_KEY: 'test', WEB_WRITE_TOKEN: 'test', R2_PRIVADO: { get: async () => ({ json: async () => old }) } }
    });
    expect(response.status).toBe(503);
  });
});
