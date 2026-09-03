import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as aceptacionRequest } from '../functions/api/aceptacion.js';

const encoder = new TextEncoder();

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function firebasePayload(email: string) {
  return new Response(JSON.stringify({
    users: [{ localId: `uid-${email}`, email, emailVerified: true }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function r2Object(value: unknown) {
  return { json: vi.fn().mockResolvedValue(value) };
}

const textoLegal = {
  id: 'PRIVACIDADE_WEB',
  idTextoLegal: 'legal-1',
  version: 'PRIVACIDADE-WEB-1.0',
  titulo: 'Protección de datos',
  texto: 'Texto legal de proba',
  ambito: 'coralpolifonicapontevedra.org',
  dataVixencia: '2026-01-01'
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('aceptación e textos legais con R2', () => {
  it('serve o texto legal vixente desde R2 sen chamar Apps Script', async () => {
    const email = 'legal-cache@example.com';
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('identitytoolkit.googleapis.com')) return firebasePayload(email);
      throw new Error(`Non se esperaba unha chamada externa: ${value}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const get = vi.fn(async (key: string) => {
      if (key === 'cache/texto-legal-vixente-v1.json') {
        return r2Object({ gardadaEn: new Date().toISOString(), textoLegal });
      }
      return null;
    });

    const response = await aceptacionRequest({
      request: new Request('https://example.test/api/aceptacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'token-legal-cache', accion: 'obterTextoLegalVixente' })
      }),
      env: {
        FIREBASE_API_KEY: 'firebase',
        WEB_WRITE_TOKEN: 'secret',
        R2_PRIVADO: { get }
      }
    } as never);

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.textoLegal).toEqual(textoLegal);
    expect(response.headers.get('X-SCPP-AppScript')).toBe('R2-TEXTO-LEGAL');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recupera durante un fallo transitorio unha aceptación validada hai menos de 30 minutos', async () => {
    const email = 'legal-stale@example.com';
    const hash = await sha256(email);
    const key = `cache/aceptacion-portal-v1/${hash}.json`;
    const gardadaEn = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('identitytoolkit.googleapis.com')) return firebasePayload(email);
      throw new Error('Apps Script temporalmente non dispoñible');
    });
    vi.stubGlobal('fetch', fetchMock);

    const get = vi.fn(async (requested: string) => {
      if (requested === key) {
        return r2Object({
          gardadaEn,
          aceptacionVixente: true,
          textoLegal
        });
      }
      return null;
    });

    const response = await aceptacionRequest({
      request: new Request('https://example.test/api/aceptacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'token-legal-stale', accion: 'comprobarAceptacion' })
      }),
      env: {
        FIREBASE_API_KEY: 'firebase',
        WEB_WRITE_TOKEN: 'secret',
        CF_PAGES_BRANCH: 'preview',
        R2_PRIVADO: { get }
      }
    } as never);

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.aceptacionVixente).toBe(true);
    expect(result.recuperado).toBe(true);
    expect(response.headers.get('X-SCPP-AppScript')).toBe('R2-STALE-ACEPTACION');
    expect(response.headers.get('X-SCPP-Legal-Cache')).toBe('stale-if-error');
  });
});
