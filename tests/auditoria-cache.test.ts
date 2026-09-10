import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/auditoria-admin.js';
import { obterJsonAppsScript } from '../functions/_lib/apps-script.js';
import { obterPermisoPortalCacheado } from '../functions/_lib/portal-permissions.js';

vi.mock('../functions/_lib/apps-script.js', () => ({ obterJsonAppsScript: vi.fn() }));
vi.mock('../functions/_lib/portal-permissions.js', () => ({
  obterPermisoPortalCacheado: vi.fn(), obterPermisoPortal: vi.fn()
}));
const payload = { ok: true, actividade: [{ accion: 'acceso' }] };
const sheetResult = () => ({ resultado: payload, resposta: new Response(), urlUsada: 'https://example.test', usouRespaldo: false, intento: 1 });
function setup(entry: unknown = null, branch = 'preview') {
  const get = vi.fn().mockResolvedValue(entry ? { json: async () => entry } : null);
  const put = vi.fn().mockResolvedValue(undefined);
  const tasks: Promise<unknown>[] = [];
  const context = {
    request: new Request('https://example.test/api/auditoria-admin', {
      method: 'POST', body: JSON.stringify({ idToken: 'test', limite: 1000 })
    }),
    env: { FIREBASE_API_KEY: 'test', WEB_WRITE_TOKEN: 'test', CF_PAGES_BRANCH: branch, R2_PRIVADO: { get, put } },
    waitUntil: (task: Promise<unknown>) => tasks.push(task)
  };
  return { context, get, put, tasks };
}
beforeEach(() => {
  vi.mocked(obterPermisoPortalCacheado).mockResolvedValue({ configurado: true, podeLer: true });
  vi.mocked(obterJsonAppsScript).mockResolvedValue(sheetResult());
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    users: [{ email: 'admin@example.test', localId: 'test', emailVerified: true }]
  }))));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe('Auditoría R2', () => {
  it('returns a 48-hour copy while Sheets is still pending, then saves the refresh', async () => {
    let resolve!: (value: ReturnType<typeof sheetResult>) => void;
    vi.mocked(obterJsonAppsScript).mockReturnValue(new Promise((done) => { resolve = done; }));
    const savedAt = Date.now() - 48 * 3600000;
    const { context, tasks, put } = setup({ savedAt, payload });
    const response = await onRequest(context);
    expect(await response.json()).toMatchObject({ ...payload, cache: { savedAt, fresca: false, actualizando: true } });
    expect(tasks).toHaveLength(1);
    expect(put).not.toHaveBeenCalled();
    resolve(sheetResult());
    await Promise.all(tasks);
    expect(put).toHaveBeenCalledWith('auditoria/cache-v1/preview/actividade.json', expect.any(String), expect.any(Object));
  });
  it('keeps the old copy when a refresh fails', async () => {
    vi.mocked(obterJsonAppsScript).mockRejectedValue(new Error('timeout'));
    const { context, tasks, put } = setup({ savedAt: Date.now() - 48 * 3600000, payload });
    expect((await onRequest(context)).status).toBe(200);
    await Promise.all(tasks);
    expect(put).not.toHaveBeenCalled();
  });
  it('serves fresh cache without Sheets and isolates the production key', async () => {
    const { context, get } = setup({ savedAt: Date.now(), payload }, 'main');
    expect((await onRequest(context)).headers.get('X-SCPP-Cache')).toBe('HIT');
    expect(get).toHaveBeenCalledWith('auditoria/cache-v1/main/actividade.json');
    expect(obterJsonAppsScript).not.toHaveBeenCalled();
  });
  it.each([null, { savedAt: 'invalid', payload }, { savedAt: Date.now() + 3600000, payload }])('seeds missing or invalid cache', async (entry) => {
    const { context } = setup(entry);
    expect((await onRequest(context)).headers.get('X-SCPP-Cache')).toBe('SEED');
    expect(obterJsonAppsScript).toHaveBeenCalledTimes(1);
  });
  it('returns valid Sheets data even if R2 read and write fail', async () => {
    const { context, get, put } = setup();
    get.mockRejectedValue(new Error('R2 unavailable'));
    put.mockRejectedValue(new Error('R2 unavailable'));
    expect(await (await onRequest(context)).json()).toMatchObject(payload);
  });
  it('denies unauthorized users before reading activity cache', async () => {
    vi.mocked(obterPermisoPortalCacheado).mockResolvedValue({ configurado: true, podeLer: false });
    const { context, get } = setup({ savedAt: Date.now(), payload });
    expect((await onRequest(context)).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
    expect(obterJsonAppsScript).not.toHaveBeenCalled();
  });
});
