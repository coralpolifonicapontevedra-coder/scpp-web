import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as concertosListPost } from '../functions/api/concertos-admin-list.js';

const encoder = new TextEncoder();

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function firebasePayload(email: string) {
  return new Response(JSON.stringify({
    users: [{ localId: 'uid-concertos', email, emailVerified: true }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function r2Object(value: unknown) {
  return { json: vi.fn().mockResolvedValue(value) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('carga inicial de Administración de Concertos', () => {
  it('usa PermisosPortal cacheado e índices R2 sen chamar Apps Script', async () => {
    const email = 'concertos@example.com';
    const permissionHash = await sha256(`${email}::concertos`);
    const permissionKey = `permisos/cache-v1/${permissionHash}.json`;
    const adminHash = await sha256(email);
    const adminKey = `persoas/cache/administracion/${adminHash}.json`;

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('identitytoolkit.googleapis.com')) return firebasePayload(email);
      throw new Error(`Non se esperaba unha chamada externa: ${value}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const get = vi.fn(async (key: string) => {
      if (key === permissionKey) {
        return r2Object({
          savedAt: Date.now(),
          email,
          modulo: 'concertos',
          value: {
            ok: true,
            nivel: 'lectura',
            fonte: 'PERMISOS_PORTAL',
            configurado: true,
            podeLer: true,
            podeEscribir: false,
            podeAdministrar: false
          }
        });
      }
      if (key === 'indices/preview/concertos-privado-v1.json') {
        return r2Object({
          ok: true,
          concertos: [{
            id: 'conc-1',
            data: '2099-12-20',
            nome: 'Concerto de proba',
            cidade: 'Pontevedra',
            lugar: 'Teatro',
            estado: 'Confirmado',
            programa: [{ idRepertorio: 'obra-1' }]
          }]
        });
      }
      if (key === 'indices/preview/asistencias-concertos.json') {
        return r2Object({
          resultado: {
            asistenciasPorConcerto: {
              'conc-1': [{ nome: 'Persoa' }]
            }
          }
        });
      }
      return null;
    });

    const response = await concertosListPost({
      request: new Request('https://example.test/api/concertos-admin-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'token', accion: 'listar' })
      }),
      env: {
        FIREBASE_API_KEY: 'firebase',
        CF_PAGES_BRANCH: 'preview',
        R2_PRIVADO: { get }
      }
    } as never);

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.almacen).toBe('R2');
    expect(result.concertos).toEqual([
      expect.objectContaining({
        idConcerto: 'conc-1',
        nome: 'Concerto de proba',
        obras: 1,
        asistencias: 1
      })
    ]);
    expect(response.headers.get('X-SCPP-Permission-Source')).toBe('R2-PERMISOS');
    expect(response.headers.get('X-SCPP-Storage')).toBe('R2');
    expect(get).toHaveBeenCalledWith(permissionKey);
    expect(get).not.toHaveBeenCalledWith(adminKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
