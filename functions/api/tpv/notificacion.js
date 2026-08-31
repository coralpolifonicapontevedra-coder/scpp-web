import {
  createNotificationSignature,
  getConfig,
  paymentKey,
  safeEqual
} from '../../_lib/ceca-tpv.js';

const ok = (accepted) => new Response(accepted ? '$*$OKY$*$' : '$*$NOK$*$', {
  status: 200,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
});

export async function onRequestPost({ request, env }) {
  const config = getConfig(env);
  if (!config || !env.R2_PRIVADO?.get || !env.R2_PRIVADO?.put) return ok(false);

  let fields;
  try {
    const form = await request.formData();
    fields = Object.fromEntries(Array.from(form.entries(), ([key, value]) => [key, String(value)]));
  } catch {
    return ok(false);
  }

  const operation = String(fields.Num_operacion || '');
  if (!/^[a-zA-Z0-9]{1,50}$/.test(operation)) return ok(false);
  if (fields.MerchantID !== config.MerchantID
    || fields.AcquirerBIN !== config.AcquirerBIN
    || fields.TerminalID !== config.TerminalID
    || fields.TipoMoneda !== '978'
    || fields.Exponente !== '2'
    || !fields.Referencia) return ok(false);

  const expectedSignature = await createNotificationSignature(config.key, fields);
  if (!safeEqual(expectedSignature, fields.Firma)) return ok(false);

  const object = await env.R2_PRIVADO.get(paymentKey(operation));
  if (!object) return ok(false);
  const payment = await object.json().catch(() => null);
  const receivedCents = Number(String(fields.Importe || '').replace(/^0+/, '') || '0');
  if (!payment || payment.operation !== operation || payment.cents !== receivedCents) return ok(false);

  if (payment.status !== 'paid') {
    await env.R2_PRIVADO.put(paymentKey(operation), JSON.stringify({
      ...payment,
      status: 'paid',
      reference: fields.Referencia,
      authorization: String(fields.Num_aut || ''),
      paymentType: String(fields.Tipo_operacion || ''),
      paidAt: new Date().toISOString()
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
    });
  }
  return ok(true);
}

export function onRequest() {
  return ok(false);
}

