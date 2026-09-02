import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../functions/api/portal-access.js';

const encoder = new TextEncoder();

async function keyFor(email: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(email));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function object(value: unknown) {
  return { json: vi.fn().mockResolvedValue(value) };
}

function firebaseUser(email = 'admin@example.com', emailVerified = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    users: [{ email, emailVerified }]
  }), { status: 200 })));
}

function request() {
  return new Request('https://example.test/api/portal-access', {
    method: 'POST',
    body: JSON.stringify({ idToken: 'token' })
  });
}

describe('portal access endpoint', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves fresh cached permissions without loading module data', async () => {
    const email = 'admin@example.com';
    const hash = await keyFor(email);
    firebaseUser(email);

    const get = vi.fn(async (key: string) => {
      if (key === `persoas/cache/administracion/${hash}.json`) {
        return object({ savedAt: Date.now(), administrador: email, payload: { perfil: { nivel: 'Administración' } } });
      }
      if (key === `cache/autorizacion-fotos/${hash}.json`) {
        return object({ email, administrador: true, verificadaEn: new Date().toISOString() });
      }
      return null;
    });

    const response = await onRequestPost({
      request: request(),
      env: { FIREBASE_API_KEY: 'key', R2_PRIVADO: { get } }
    });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      ok: true,
      administrationAllowed: true,
      reviewAllowed: true,
      administrationKnown: true,
      reviewKnown: true
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('marks missing caches as unknown rather than denying access', async () => {
    firebaseUser();

    const response = await onRequestPost({
      request: request(),
      env: { FIREBASE_API_KEY: 'key', R2_PRIVADO: { get: vi.fn().mockResolvedValue(null) } }
    });
    const result = await response.json();

    expect(result).toMatchObject({
      administrationAllowed: false,
      reviewAllowed: false,
      administrationKnown: false,
      reviewKnown: false
    });
  });

  it('treats expired caches as unknown instead of confirmed denial', async () => {
    const email = 'admin@example.com';
    const hash = await keyFor(email);
    const expired = Date.now() - 31 * 24 * 60 * 60 * 1000;
    firebaseUser(email);

    const get = vi.fn(async (key: string) => {
      if (key === `persoas/cache/administracion/${hash}.json`) {
        return object({ savedAt: expired, administrador: email, payload: { perfil: { nivel: 'Administración' } } });
      }
      if (key === `cache/autorizacion-fotos/${hash}.json`) {
        return object({ email, administrador: true, verificadaEn: new Date(expired).toISOString() });
      }
      return null;
    });

    const response = await onRequestPost({
      request: request(),
      env: { FIREBASE_API_KEY: 'key', R2_PRIVADO: { get } }
    });
    const result = await response.json();

    expect(result).toMatchObject({
      administrationAllowed: false,
      reviewAllowed: false,
      administrationKnown: false,
      reviewKnown: false
    });
  });

  it('rejects cache entries belonging to another identity', async () => {
    const email = 'admin@example.com';
    const hash = await keyFor(email);
    firebaseUser(email);

    const get = vi.fn(async (key: string) => {
      if (key === `persoas/cache/administracion/${hash}.json`) {
        return object({ savedAt: Date.now(), administrador: 'other@example.com', payload: { perfil: { nivel: 'Administración' } } });
      }
      if (key === `cache/autorizacion-fotos/${hash}.json`) {
        return object({ email: 'other@example.com', administrador: true, verificadaEn: new Date().toISOString() });
      }
      return null;
    });

    const response = await onRequestPost({
      request: request(),
      env: { FIREBASE_API_KEY: 'key', R2_PRIVADO: { get } }
    });
    const result = await response.json();

    expect(result.administrationKnown).toBe(false);
    expect(result.reviewKnown).toBe(false);
  });

  it('preserves an explicit fresh photo-review denial', async () => {
    const email = 'admin@example.com';
    const hash = await keyFor(email);
    firebaseUser(email);

    const get = vi.fn(async (key: string) => {
      if (key === `cache/autorizacion-fotos/${hash}.json`) {
        return object({ email, administrador: false, verificadaEn: new Date().toISOString() });
      }
      return null;
    });

    const response = await onRequestPost({
      request: request(),
      env: { FIREBASE_API_KEY: 'key', R2_PRIVADO: { get } }
    });
    const result = await response.json();

    expect(result.reviewKnown).toBe(true);
    expect(result.reviewAllowed).toBe(false);
  });

  it('returns 401 for an unverified Firebase account', async () => {
    firebaseUser('admin@example.com', false);

    const response = await onRequestPost({
      request: request(),
      env: { FIREBASE_API_KEY: 'key', R2_PRIVADO: { get: vi.fn() } }
    });

    expect(response.status).toBe(401);
  });

  it('degrades R2 read failures to unknown access instead of false denial', async () => {
    firebaseUser();
    const get = vi.fn().mockRejectedValue(new Error('R2 unavailable'));

    const response = await onRequestPost({
      request: request(),
      env: { FIREBASE_API_KEY: 'key', R2_PRIVADO: { get } }
    });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      administrationKnown: false,
      reviewKnown: false,
      administrationAllowed: false,
      reviewAllowed: false
    });
    expect(response.headers.get('X-SCPP-Access-Source')).toBe('R2-PARTIAL');
  });
});
