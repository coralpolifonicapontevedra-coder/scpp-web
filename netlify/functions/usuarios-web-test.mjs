import { timingSafeEqual } from 'node:crypto';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

const sameSecret = (received, expected) => {
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');

  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  const scriptUrl = process.env.USUARIOS_WEB_SCRIPT_URL;
  const writeToken = process.env.USUARIOS_WEB_WRITE_TOKEN;
  const testEmail = process.env.USUARIOS_WEB_TEST_EMAIL;
  const testKey = process.env.USUARIOS_WEB_TEST_KEY;

  if (!scriptUrl || !writeToken || !testEmail || !testKey) {
    return json(503, {
      ok: false,
      erro: 'A proba non está configurada completamente',
    });
  }

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, erro: 'Petición non válida' });
  }

  if (!sameSecret(input.clave, testKey)) {
    return json(401, { ok: false, erro: 'Clave de proba incorrecta' });
  }

  const observacions = String(input.observacions || '').trim();
  if (!observacions || observacions.length > 500) {
    return json(400, {
      ok: false,
      erro: 'O texto debe ter entre 1 e 500 caracteres',
    });
  }

  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: JSON.stringify({
        token: writeToken,
        accion: 'actualizarObservacions',
        email: testEmail,
        observacions,
      }),
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return json(502, {
        ok: false,
        erro: 'O servizo de datos devolveu unha resposta non válida',
      });
    }

    if (!response.ok || !result?.ok) {
      const detalle = typeof result?.detalle === 'string'
        ? result.detalle.slice(0, 300)
        : '';

      return json(502, {
        ok: false,
        erro: result?.erro || 'Non foi posible actualizar os datos',
        ...(detalle ? { detalle } : {}),
      });
    }

    return json(200, {
      ok: true,
      mensaxe: 'Observacións actualizadas correctamente',
    });
  } catch {
    return json(502, {
      ok: false,
      erro: 'Non foi posible contactar co servizo de datos',
    });
  }
};
