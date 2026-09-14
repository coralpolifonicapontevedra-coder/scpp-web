import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obterJsonAppsScript } from '../functions/_lib/apps-script.js';
import { comprobarLecturaPortal, invalidarPermisosPortal, obterPermisoPortalCacheado } from '../functions/_lib/portal-permissions.js';
import { onRequest as gallery } from '../functions/api/galeria-privada.js';
import { onRequest as scores } from '../functions/api/partituras.js';
import { onRequest as repertoire } from '../functions/api/repertorio.js';
import { onRequest as repertoireV2 } from '../functions/api/repertorio-cache-v2.js';
import { onRequest as documents } from '../functions/api/documentacion.js';
import { onRequest as root } from '../functions/_middleware.js';
import { onRequestPost as sync } from '../functions/api/permisos-cache-sync.js';

vi.mock('../functions/_lib/apps-script.js', async (original) => ({
  ...await original<typeof import('../functions/_lib/apps-script.js')>(),
  obterJsonAppsScript: vi.fn()
}));

const user = { email: 'coralista@example.invalid', uid: 'synthetic' };
const request = (path: string, body: object = {}) => new Request(`https://example.test${path}`, {
  method: 'POST', body: JSON.stringify({ idToken: crypto.randomUUID(), ...body })
});
const object = (value: unknown) => ({ json: async () => value });
const backendResult = (resultado: object) => ({ resultado, resposta: new Response('{}'), urlUsada: 'https://example.invalid', usouRespaldo: false, intento: 1 });
let member = true;
let levels: Record<string, string> = {};
let docs: object[] = [];
let unavailable = false;
let institutionalAdmin = false;
const backend = vi.mocked(obterJsonAppsScript);
const envFor = () => ({
  FIREBASE_API_KEY: 'fake', WEB_WRITE_TOKEN: 'fake', CF_PAGES_BRANCH: 'main',
  R2_PRIVADO: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), delete: vi.fn(), list: vi.fn() }
});

beforeEach(() => {
  member = true; levels = {}; docs = []; unavailable = false; institutionalAdmin = false;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ users: [{ email: user.email, localId: user.uid, emailVerified: true }] }))));
  backend.mockReset();
  backend.mockImplementation(async (_env, body) => {
    if (unavailable) throw new Error('unavailable');
    let resultado;
    if (body.accion === 'comprobarAceptacion') resultado = member ? { ok: true } : { ok: false, erro: 'Usuario non autorizado' };
    else if (body.accion === 'obterPermisosUsuarioPortal') resultado = { ok: true, efectivos: levels, permisos: [] };
    else if (body.accion === 'listarDocumentacionPortal') resultado = { ok: true, documentos: docs };
    else if (body.accion === 'comprobarFotosAdministracionPortal') resultado = { ok: institutionalAdmin, administrador: institutionalAdmin };
    else throw new Error(`Unexpected action: ${body.accion}`);
    return backendResult(resultado);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('autorización executada no servidor', () => {
  it('conserva a lectura ordinaria de membros activos e respecta os niveis explícitos', async () => {
    const env = envFor();
    expect(await comprobarLecturaPortal(env, user, 'partituras')).toBe(true);
    for (const level of ['lectura', 'escritura', 'administracion']) {
      levels = { partituras: level };
      expect(await comprobarLecturaPortal(env, user, 'partituras')).toBe(true);
    }
    levels = { partituras: 'sen_acceso' };
    expect(await comprobarLecturaPortal(env, user, 'partituras')).toBe(false);
    levels = { partituras: 'unknown' };
    expect(await comprobarLecturaPortal(env, user, 'partituras')).toBe(false);
  });

  it('rexeita usuarios dados de baixa aínda con permiso explícito', async () => {
    member = false; levels = { partituras: 'administracion' };
    expect(await comprobarLecturaPortal(envFor(), user, 'partituras')).toBe(false);
  });

  const readers = [
    { run: gallery, path: '/api/galeria-privada', module: 'fotografias', body: { accion: 'listar' } },
    { run: gallery, path: '/api/galeria-privada', module: 'fotografias', body: { accion: 'imaxe', idFoto: '1' } },
    { run: scores, path: '/api/partituras', module: 'partituras', body: { accion: 'obterFicheiroPartitura', r2Key: 'partituras/demo.pdf' } },
    { run: repertoire, path: '/api/repertorio', module: 'repertorio', body: { accion: 'obterFicheiroRepertorio', r2Key: 'partituras/demo.pdf' } },
    { run: repertoireV2, path: '/api/repertorio-cache-v2', module: 'repertorio', body: { accion: 'listarRepertorioPortal' } },
    { run: documents, path: '/api/documentacion', module: 'documentacion', body: { accion: 'listarDocumentacionPortal' } }
  ];
  for (const reader of readers) {
    it(`bloquea ${reader.path}/${reader.body.accion} antes de ler R2 cando hai sen_acceso`, async () => {
      const env = envFor(); levels = { [reader.module]: 'sen_acceso' };
      const response = await reader.run({ env, request: request(reader.path, reader.body) });
      expect(response.status).toBe(403);
      expect(env.R2_PRIVADO.get.mock.calls.every(([key]) => key.startsWith('permisos/autorizacion-v1/'))).toBe(true);
    });
    it(`non autoriza ${reader.path}/${reader.body.accion} se falla o backend`, async () => {
      const env = envFor(); unavailable = true;
      const response = await reader.run({ env, request: request(reader.path, reader.body) });
      expect(response.status).toBe(503);
      expect(env.R2_PRIVADO.get.mock.calls.every(([key]) => key.startsWith('permisos/autorizacion-v1/'))).toBe(true);
    });
  }

  it('un membro autorizado pode listar a galería', async () => {
    const env = envFor();
    env.R2_PRIVADO.get.mockResolvedValue(object({ version: 1, fotos: [{ idFoto: 'demo' }] }));
    const response = await gallery({ env, request: request('/api/galeria-privada', { accion: 'listar' }) });
    expect(response.status).toBe(200);
    expect((await response.json()).fotos).toEqual([{ idFoto: 'demo' }]);
  });

  it('revalida documentos: unha descarga permitida deixa de selo tras retirar o documento', async () => {
    const env = envFor();
    env.R2_PRIVADO.get.mockResolvedValue({ body: 'demo', writeHttpMetadata() {} });
    docs = [{ id: '1', ruta: 'demo.pdf', clase: 'documento', titulo: 'Demo' }];
    const body = { accion: 'obterFicheiroDocumentacion', ruta: 'demo.pdf', clase: 'documento' };
    const first = await documents({ env, request: request('/api/documentacion', body) });
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    docs = []; env.R2_PRIVADO.get.mockClear();
    const second = await documents({ env, request: request('/api/documentacion', body) });
    expect(second.status).toBe(403);
    expect(env.R2_PRIVADO.get.mock.calls.every(([key]) => key.startsWith('permisos/autorizacion-v1/'))).toBe(true);
  });

  it('non reutiliza o listado antigo cando o backend de documentación denega', async () => {
    const env = envFor();
    vi.stubGlobal('caches', { default: { match: vi.fn().mockResolvedValue(new Response(JSON.stringify({ savedAt: Date.now(), payload: { ok: true, documentos: [{ ruta: 'demo.pdf' }] } }))) } });
    backend.mockImplementation(async (_env, body) => backendResult(body.accion === 'comprobarAceptacion' ? { ok: true } : body.accion === 'obterPermisosUsuarioPortal' ? { ok: true, efectivos: {}, permisos: [] } : { ok: false, erro: 'Usuario non autorizado' }));
    expect((await documents({ env, request: request('/api/documentacion') })).status).toBe(403);
  });

  it('a revogación de fotos bloquea a vía rápida antes de ler autorizacións antigas', async () => {
    const env = envFor(); levels = { fotografias: 'sen_acceso' };
    env.R2_PRIVADO.get.mockResolvedValue(object({ administrador: true, email: user.email, verificadaEn: new Date(Date.now() - 29 * 86400000).toISOString() }));
    const next = vi.fn();
    const response = await root({ env, request: request('/api/fotos', { accion: 'listarFotosRevision' }), next });
    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(env.R2_PRIVADO.get.mock.calls.every(([key]) => key.startsWith('permisos/autorizacion-v1/'))).toBe(true);
  });

  it('non reutiliza unha resposta compartida de asistencias doutro usuario', async () => {
    const cached = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, marker: 'other-user' })));
    vi.stubGlobal('caches', { default: { match: cached } });
    backend.mockImplementation(async (_env, body) => backendResult(
      body.accion === 'comprobarAceptacion' ? { ok: true } :
      body.accion === 'obterPermisosUsuarioPortal' ? { ok: true, efectivos: {}, permisos: [] } :
      { ok: true, marker: body.email }
    ));
    const result = await repertoire({ env: envFor(), request: request('/api/repertorio', { accion: 'listarAsistenciasConcertosPortal' }) });
    expect(result.status).toBe(200);
    expect((await result.json()).marker).toBe(user.email);
    expect(cached).not.toHaveBeenCalled();
  });

  it('unha resposta incompleta de permisos non equivale a acceso ordinario', async () => {
    backend.mockResolvedValue(backendResult({ ok: true }));
    await expect(comprobarLecturaPortal(envFor(), user, 'partituras')).rejects.toThrow('A resposta de permisos non é válida.');
  });

  it('o orixinal do editor tamén comproba o permiso con Bearer en GET', async () => {
    const env = envFor(); levels = { fotografias: 'lectura' };
    const response = await root({ env, request: new Request('https://example.test/api/editor-fotos-original?idFoto=demo', { headers: { Authorization: 'Bearer fake' } }), next: vi.fn() });
    expect(response.status).toBe(403);
  });

  it('a administración institucional vixente pode continuar ao handler', async () => {
    institutionalAdmin = true;
    const next = vi.fn().mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    expect((await root({ env: envFor(), request: request('/api/administracion-fotografias'), next })).status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it('invalidar un módulo borra autorizacións fotográficas e administrativas antigas', async () => {
    const env = envFor();
    await invalidarPermisosPortal(env, user.email, ['fotografias']);
    const keys = env.R2_PRIVADO.delete.mock.calls.flat();
    expect(keys.some(k => k.startsWith('cache/autorizacion-fotos/'))).toBe(true);
    expect(keys.some(k => k.startsWith('persoas/cache/administracion/'))).toBe(true);
    expect(keys.some(k => k.startsWith('permisos/cache-v2/main/'))).toBe(true);
  });

  it('a invalidación non oculta erros de almacenamento', async () => {
    const env = envFor(); env.R2_PRIVADO.delete.mockRejectedValue(new Error('R2 unavailable'));
    await expect(invalidarPermisosPortal(env, user.email, ['fotografias'])).rejects.toThrow('R2 unavailable');
  });

  it('reutiliza brevemente lecturas e a invalidación elimina esa decisión', async () => {
    const env = envFor();
    const entries = new Map<string, string>();
    env.R2_PRIVADO.get.mockImplementation(async (key: string) => entries.has(key) ? object(JSON.parse(entries.get(key)!)) : null);
    env.R2_PRIVADO.put.mockImplementation(async (key: string, value: string) => { entries.set(key, value); });
    env.R2_PRIVADO.delete.mockImplementation(async (key: string) => { entries.delete(key); });
    expect(await comprobarLecturaPortal(env, user, 'partituras')).toBe(true);
    const calls = backend.mock.calls.length;
    expect(await comprobarLecturaPortal(env, user, 'partituras')).toBe(true);
    expect(backend.mock.calls.length).toBe(calls);
    levels = { partituras: 'sen_acceso' };
    await invalidarPermisosPortal(env, user.email, ['partituras']);
    expect(await comprobarLecturaPortal(env, user, 'partituras')).toBe(false);
  });

  it('a lectura caduca aos 60 segundos mesmo se se perdeu a invalidación', async () => {
    const env = envFor(); member = false;
    env.R2_PRIVADO.get.mockResolvedValue(object({ email: user.email, modulo: 'partituras', tipo: 'lectura', allowed: true, savedAt: Date.now() - 60001 }));
    expect(await comprobarLecturaPortal(env, user, 'partituras')).toBe(false);
  });

  it('non usa a autorización breve para unha escritura administrativa', async () => {
    const env = envFor(); member = false;
    env.R2_PRIVADO.get.mockResolvedValue(object({ email: user.email, modulo: 'fotografias', tipo: 'administracion', allowed: true, savedAt: Date.now() }));
    const next = vi.fn();
    const response = await root({ env, request: request('/api/gardar-borrador-foto'), next });
    expect(response.status).toBe(403);
    expect(env.R2_PRIVADO.get).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('invalidarTodo inclúe o prefixo de autorización de fotos', async () => {
    const env = envFor(); env.R2_PRIVADO.list.mockResolvedValue({ objects: [], truncated: false });
    expect((await sync({ env, request: request('/api/permisos-cache-sync', { token: 'fake', accion: 'invalidarTodo' }) })).status).toBe(200);
    expect(env.R2_PRIVADO.list).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'cache/autorizacion-fotos/' }));
  });

  it('non acepta entradas de permisos con data futura ou de hai máis de cinco minutos', async () => {
    const env = envFor();
    for (const savedAt of [Date.now() + 60000, Date.now() - 6 * 60000, 'invalid']) {
      env.R2_PRIVADO.get.mockResolvedValue(object({ email: user.email, modulo: 'fotografias', savedAt, value: { ok: true } }));
      expect(await obterPermisoPortalCacheado(env, user, 'fotografias')).toBeNull();
    }
  });
});
