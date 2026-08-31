import {
  cecaEndpoint,
  createOperationId,
  createPaymentSignature,
  getConfig,
  parseAmountToCents,
  paymentKey
} from '../../_lib/ceca-tpv.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

function isSameOrigin(request) {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin) return origin === expected;
  const referer = request.headers.get('Referer');
  return Boolean(referer && new URL(referer).origin === expected);
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: 'Origen de la solicitud no válido.' });

  const config = getConfig(env);
  if (!config || !env.R2_PRIVADO?.put) {
    return json(503, { ok: false, error: 'La pasarela de pago todavía no está activada.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'Solicitud no válida.' });
  }

  if (String(body.website || '').trim()) return json(400, { ok: false, error: 'Solicitud no válida.' });
  const cents = parseAmountToCents(body.amount);
  const method = String(body.method || '').toLowerCase();
  const locale = body.locale === 'gl' ? 'gl' : 'es';
  if (cents === null) return json(400, { ok: false, error: 'El importe debe estar entre 2 y 5.000 euros.' });
  if (!['card', 'bizum'].includes(method)) return json(400, { ok: false, error: 'Selecciona tarjeta o Bizum.' });

  const operation = createOperationId();
  const siteOrigin = 'https://coralpolifonicapontevedra.org';
  const returnBase = locale === 'gl' ? '/pago' : '/es/pago';
  const fields = {
    MerchantID: config.MerchantID,
    AcquirerBIN: config.AcquirerBIN,
    TerminalID: config.TerminalID,
    Num_operacion: operation,
    Importe: String(cents),
    TipoMoneda: '978',
    Exponente: '2',
    URL_OK: `${siteOrigin}${returnBase}/correcto/?operacion=${operation}`,
    URL_NOK: `${siteOrigin}${returnBase}/cancelado/?operacion=${operation}`,
    Cifrado: 'SHA2',
    Idioma: locale === 'gl' ? '4' : '1',
    Pago_soportado: 'SSL',
    Descripcion: locale === 'gl' ? 'Colaboracion coa Sociedade Coral Polifonica de Pontevedra' : 'Colaboracion con la Sociedad Coral Polifonica de Pontevedra'
  };
  fields[method === 'bizum' ? 'inicioBizum' : 'inicioTarjeta'] = '1';
  fields.Firma = await createPaymentSignature(config.key, fields);

  await env.R2_PRIVADO.put(paymentKey(operation), JSON.stringify({
    version: 1,
    operation,
    cents,
    method,
    locale,
    status: 'pending',
    environment: config.environment,
    createdAt: new Date().toISOString()
  }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });

  return json(200, { ok: true, action: cecaEndpoint(config.environment), fields });
}

export function onRequest() {
  return json(405, { ok: false, error: 'Método no permitido.' });
}

