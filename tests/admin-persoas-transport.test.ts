import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/persoas-v2.js';

const PROD_URL = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

describe('Administración → Persoas transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('garda unha persoa cando Apps Script responde 302 e rexenera a cache', async () => {
    const writeRedirect = 'https://script.googleusercontent.com/macros/echo?user_content_key=write&lib=abc';
    const listRedirect = 'https://script.googleusercontent.com/macros/echo?user_content_key=list&lib=abc';

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        users: [{ localId: 'uid-admin', email: 'admin@example.com', emailVerified: true }]
      }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: writeRedirect } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idPersoa: 'persoa-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: listRedirect } }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        perfil: { nivel: 'Administración' },
        persoas: [{ idPersoa: 'persoa-1', nome: 'Persoa Proba' }]
      }));

    vi.stubGlobal('fetch', fetchMock);

    const permissionObject = {
      json: vi.fn().mockResolvedValue({
        savedAt: Date.now(),
        email: 'admin@example.com',
        modulo: 'persoas',
        value: {
          ok: true,
          nivel: 'administracion',
          fonte: 'PERMISOS_PORTAL',
          configurado: true,
          podeLer: true,
          podeEscribir: true,
          podeAdministrar: true
        }
      })
    };
    const get = vi.fn()
      .mockResolvedValueOnce(permissionObject)
      .mockResolvedValueOnce(null);
    const put = vi.fn().mockResolvedValue(undefined);

    const response = await onRequest({
      request: new Request('https://example.test/api/persoas-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: 'firebase-token-persoas-write',
          accion: 'actualizarPersoaAdministracion',
          idPersoa: 'persoa-1',
          persoa: { Nome: 'Persoa Proba' }
        })
      }),
      env: {
        FIREBASE_API_KEY: 'firebase-key',
        WEB_WRITE_TOKEN: 'secret',
        CF_PAGES_BRANCH: 'main',
        APPS_SCRIPT_WEBAPP_URL: PROD_URL,
        R2_PRIVADO: { get, put }
      }
    } as never);

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-SCPP-Write')).toBe('OK');
    expect(result).toMatchObject({
      ok: true,
      idPersoa: 'persoa-1',
      cacheActualizada: true,
      permiso: {
        nivel: 'administracion',
        podeLer: true,
        podeEscribir: true,
        podeAdministrar: true
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[1][0]).toBe(PROD_URL);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(fetchMock.mock.calls[2][0]).toBe(writeRedirect);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[2][1]).not.toHaveProperty('body');
    expect(fetchMock.mock.calls[3][0]).toBe(PROD_URL);
    expect(fetchMock.mock.calls[4][0]).toBe(listRedirect);
    expect(get).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(3);
  });
});
