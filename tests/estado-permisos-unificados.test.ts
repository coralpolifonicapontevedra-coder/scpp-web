import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as estadoPost } from '../functions/api/estado-sistema.js';

const encoder = new TextEncoder();

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function firebasePayload(email: string) {
  return new Response(JSON.stringify({
    users: [{ localId: 'uid-estado', email, emailVerified: true }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function r2Object(value: unknown) {
  return { json: vi.fn().mockResolvedValue(value) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('permiso común de Estado do sistema', () => {
  it('acepta lectura desde PermisosPortal cacheado sen depender da caché administrativa de Persoas', async () => {
    const email = 'estado@example.com';
    const permissionHash = await sha256(`${email}::estado`);
    const permissionKey = `permisos/cache-v1/${permissionHash}.json`;
    const adminHash = await sha256(email);
    const adminKey = `persoas/cache/administracion/${adminHash}.json`;

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('identitytoolkit.googleapis.com')) return firebasePayload(email);
      if (value.includes('api.github.com/repos/')) {
        return new Response(JSON.stringify({ workflow_runs: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const get = vi.fn(async (key: string) => {
      if (key === permissionKey) {
        return r2Object({
          savedAt: Date.now(),
          email,
          modulo: 'estado',
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
        R2_PRIVADO: { get }
      }
    } as never);

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(response.headers.get('X-SCPP-Permission-Source')).toBe('R2-PERMISOS');
    expect(response.headers.get('X-SCPP-Permission-Level')).toBe('lectura');
    expect(get).toHaveBeenCalledWith(permissionKey);
    expect(get).not.toHaveBeenCalledWith(adminKey);
  });
});
