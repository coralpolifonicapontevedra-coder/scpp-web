import { afterEach, describe, expect, it, vi } from 'vitest';
import { obterJsonAppsScript, AppsScriptError } from '../functions/_lib/apps-script.js';
import { onRequestPost as permisosPost } from '../functions/api/permisos.js';
import { onRequestPost as estadoPost } from '../functions/api/estado-sistema.js';

const PROD_URL = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const encoder = new TextEncoder();

async function hashEmail(email: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(email));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function firebasePayload(email = 'admin@example.com') {
  return new Response(JSON.stringify({
    users: [{ localId: 'uid-admin', email, emailVerified: true }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function r2Object(value: unknown) {
  return { json: vi.fn().mockResolvedValue(value) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Apps Script transport recovery', () => {
  it('follows the Apps Script 302 as GET without forwarding the POST body', async () => {
    const destino = 'https://script.googleusercontent.com/macros/echo?user_content_key=test&lib=abc';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: destino }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, actividade: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    vi.stubGlobal('fetch', fetchMock);

    const { resultado } = await obterJsonAppsScript({
      CF_PAGES_BRANCH: 'main',
      APPS_SCRIPT_WEBAPP_URL: PROD_URL
    }, {
      accion: 'listarActividadePortal',
      token: 'secret',
      email: 'admin@example.com'
    });

    expect(resultado).toEqual({ ok: true, actividade: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(fetchMock.mock.calls[1][0]).toBe(destino);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'GET', redirect: 'follow' });
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('body');
  });

  it('rejects redirects outside script.googleusercontent.com', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: 'https://example.com/steal' }
    })));

    await expect(obterJsonAppsScript({
      CF_PAGES_BRANCH: 'main',
      APPS_SCRIPT_WEBAPP_URL: PROD_URL
    }, {
      accion: 'listarActividadePortal',
      token: 'secret',
      email: 'admin@example.com'
    })).rejects.toMatchObject({ code: 'APPS_SCRIPT_INVALID_REDIRECT' } satisfies Partial<AppsScriptError>);
  });
});

describe('administration recovery', () => {
  it('opens permissions from the R2 administration context and makes only one Apps Script operation', async () => {
    const email = 'admin@example.com';
    const hash = await hashEmail(email);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(firebasePayload(email))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: 'https://script.googleusercontent.com/macros/echo?user_content_key=permissions&lib=abc' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        usuarios: [],
        permisos: [],
        modulos: ['concertos', 'repertorio']
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const get = vi.fn(async (key: string) => {
      if (key !== `persoas/cache/administracion/${hash}.json`) return null;
      return r2Object({
        administrador: email,
        payload: {
          perfil: { nivel: 'Administración' },
          persoas: [{ rowId: '1', nome: 'Admin', correo: email, activo: true }]
        }
      });
    });

    const response = await permisosPost({
      request: new Request('https://example.test/api/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'token', accion: 'listarPermisosPortal' })
      }),
      env: {
        FIREBASE_API_KEY: 'firebase',
        WEB_WRITE_TOKEN: 'secret',
        CF_PAGES_BRANCH: 'main',
        APPS_SCRIPT_WEBAPP_URL: PROD_URL,
        R2_PRIVADO: { get }
      }
    } as never);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.administrador).toBe(true);
    expect(result.usuarios).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('authorizes Estado do sistema from R2 before running health checks', async () => {
    const email = 'admin@example.com';
    const hash = await hashEmail(email);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('identitytoolkit.googleapis.com')) return firebasePayload(email);
      if (value === PROD_URL) return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      if (value.includes('api.github.com/repos/')) return new Response(JSON.stringify({ workflow_runs: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      return new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const get = vi.fn(async (key: string) => {
      if (key === `persoas/cache/administracion/${hash}.json`) {
        return r2Object({ administrador: email, payload: { perfil: { nivel: 'Administración' } } });
      }
      if (key === 'indices/revision-fotos-v1.json') return r2Object({ ok: true });
      return null;
    });

    const response = await estadoPost({
      request: new Request('https://example.test/api/estado-sistema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'token' })
      }),
      env: {
        FIREBASE_API_KEY: 'firebase',
        APPS_SCRIPT_WEBAPP_URL: PROD_URL,
        R2_PRIVADO: { get }
      }
    } as never);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'apps-script', state: 'ok' })
    ]));
    expect(get).toHaveBeenCalledWith(`persoas/cache/administracion/${hash}.json`);
  });
});
