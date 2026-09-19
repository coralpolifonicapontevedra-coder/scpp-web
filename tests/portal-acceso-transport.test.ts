import { afterEach, describe, expect, it, vi } from 'vitest';
import { obterJsonAppsScript } from '../functions/_lib/apps-script.js';

const PROD_URL = 'https://script.google.com/macros/s/AKfycbwxlH1BRoKrmUxSSk_KmtLrhsgToO1OHhw3IBtg8ceqigKxErvkzlS2mHWutv9Wb0OsXA/exec';
const PREVIEW_URL = PROD_URL;

function okResponse() {
  return new Response(JSON.stringify({
    ok: true,
    aceptacionVixente: true,
    textoLegal: null
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('portal access transport', () => {
  it.each([
    'obterTextoLegalVixente',
    'comprobarAceptacion',
    'rexistrarAceptacion'
  ])('anchors %s to the stable production deployment', async (accion) => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await obterJsonAppsScript({
      CF_PAGES_BRANCH: 'main',
      APPS_SCRIPT_WEBAPP_URL: 'https://script.google.com/macros/s/WRONG_DEPLOYMENT/exec'
    }, {
      accion,
      token: 'secret',
      email: 'socio@example.com'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(PROD_URL);
  });

  it('keeps acceptance actions isolated from production while running preview', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await obterJsonAppsScript({
      CF_PAGES_BRANCH: 'preview',
      APPS_SCRIPT_WEBAPP_URL: PROD_URL
    }, {
      accion: 'comprobarAceptacion',
      token: 'secret',
      email: 'socio@example.com'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(PREVIEW_URL);
  });
});
