import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/persoas-foto.js';

function objectJson(value: unknown) {
  return { json: vi.fn().mockResolvedValue(value) };
}

function invitation(token: string) {
  return {
    token,
    estado: 'PENDENTE',
    idPersoa: '42',
    revisionId: 'rev-1',
    caducaEn: new Date(Date.now() + 60_000).toISOString()
  };
}

const token = 'A'.repeat(48);

describe('fotografía privada de Persoas', () => {
  it('informa de que non hai fotografía sen expoñer R2', async () => {
    const get = vi.fn(async (key: string) => {
      if (key === `persoas/revisions/${token}.json`) return objectJson(invitation(token));
      return null;
    });

    const response = await onRequest({
      request: new Request(`https://example.test/api/persoas-foto?token=${token}`),
      env: { R2_PRIVADO: { get } }
    });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual({ ok: true, disponible: false });
  });

  it('garda unha foto permitida e actualiza o índice privado', async () => {
    const get = vi.fn(async (key: string) => {
      if (key === `persoas/revisions/${token}.json`) return objectJson(invitation(token));
      return null;
    });
    const put = vi.fn().mockResolvedValue(undefined);
    const form = new FormData();
    form.append('token', token);
    form.append('foto', new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' }));

    const response = await onRequest({
      request: new Request('https://example.test/api/persoas-foto', { method: 'POST', body: form }),
      env: { R2_PRIVADO: { get, put } }
    });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ ok: true, disponible: true, mimeType: 'image/jpeg' });
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[0][0]).toBe('persoas/fotos/42/actual.jpg');
    expect(put.mock.calls[1][0]).toBe('persoas/fotos/42/latest.json');
  });

  it('rexeita formatos que non son imaxe permitida', async () => {
    const get = vi.fn(async (key: string) => {
      if (key === `persoas/revisions/${token}.json`) return objectJson(invitation(token));
      return null;
    });
    const put = vi.fn();
    const form = new FormData();
    form.append('token', token);
    form.append('foto', new File(['x'], 'ficheiro.pdf', { type: 'application/pdf' }));

    const response = await onRequest({
      request: new Request('https://example.test/api/persoas-foto', { method: 'POST', body: form }),
      env: { R2_PRIVADO: { get, put } }
    });

    expect(response.status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });
});
