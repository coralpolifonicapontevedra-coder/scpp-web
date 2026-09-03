import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/ensaios-admin-v2.js';

const PROD_URL = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const WRONG_URL = 'https://script.google.com/macros/s/AKfycbWrongConfiguredDeployment123456789/exec';

function jsonObject(value: unknown) {
  return { json: vi.fn().mockResolvedValue(value) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Administración → Ensaios transport', () => {
  it('creates an ensayo only through the pinned v98 deployment on main', async () => {
    let appsScriptPosts = 0;
    const seenScriptUrls: string[] = [];

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('identitytoolkit.googleapis.com')) {
        return new Response(JSON.stringify({
          users: [{ localId: 'uid-admin', email: 'admin@example.com', emailVerified: true }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.startsWith('https://script.google.com/macros/s/')) {
        seenScriptUrls.push(url);
        expect(url).toBe(PROD_URL);
        expect(init?.method).toBe('POST');
        appsScriptPosts += 1;
        const suffix = appsScriptPosts === 1 ? 'write' : 'list';
        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://script.googleusercontent.com/macros/echo?user_content_key=${suffix}&lib=test`
          }
        });
      }

      if (url.includes('script.googleusercontent.com/macros/echo')) {
        expect(init?.method).toBe('GET');
        if (url.includes('user_content_key=write')) {
          return new Response(JSON.stringify({
            ok: true,
            resultado: { idEnsaio: 'ensaio-1' }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          ok: true,
          perfil: { nivel: 'Administración' },
          ensaios: [{ idEnsaio: 'ensaio-1', data: '2026-09-03' }],
          persoas: [],
          asistencias: [],
          ensaiosRepertorio: [],
          repertorio: [],
          seguimento: {}
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const get = vi.fn(async (key: string) => {
      if (key.startsWith('persoas/cache/administracion/')) {
        return jsonObject({
          administrador: 'admin@example.com',
          payload: { perfil: { nivel: 'Administración' } }
        });
      }
      if (key === 'indices/concertos-privado-v1.json') {
        return jsonObject({ ok: true, concertos: [] });
      }
      return null;
    });
    const put = vi.fn().mockResolvedValue(undefined);

    const response = await onRequest({
      request: new Request('https://example.test/api/ensaios-admin-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: 'firebase-token',
          accion: 'crear',
          data: '2026-09-03',
          horaInicio: '20:30',
          horaFin: '22:00',
          lugar: 'Local de ensaio',
          tipoEnsaio: 'Ordinario'
        })
      }),
      env: {
        FIREBASE_API_KEY: 'firebase-key',
        WEB_WRITE_TOKEN: 'write-token',
        CF_PAGES_BRANCH: 'main',
        APPS_SCRIPT_WEBAPP_URL: WRONG_URL,
        APPS_SCRIPT_FALLBACK_URL: WRONG_URL,
        R2_PRIVADO: { get, put }
      }
    } as never);

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ ok: true, almacen: 'SHEET+R2' });
    expect(appsScriptPosts).toBe(2);
    expect(seenScriptUrls).toEqual([PROD_URL, PROD_URL]);
    expect(seenScriptUrls).not.toContain(WRONG_URL);
    expect(put).toHaveBeenCalled();
  });
});
