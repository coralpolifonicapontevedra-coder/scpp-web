import { paymentKey } from '../../_lib/ceca-tpv.js';

const response = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

export async function onRequestGet({ request, env }) {
  const operation = new URL(request.url).searchParams.get('operacion') || '';
  if (!/^[a-zA-Z0-9]{1,50}$/.test(operation) || !env.R2_PRIVADO?.get) {
    return response(404, { ok: false });
  }
  const object = await env.R2_PRIVADO.get(paymentKey(operation));
  if (!object) return response(404, { ok: false });
  const payment = await object.json().catch(() => null);
  if (!payment) return response(404, { ok: false });
  return response(200, {
    ok: true,
    status: payment.status === 'paid' ? 'paid' : 'pending',
    amount: (payment.cents / 100).toFixed(2),
    method: payment.method
  });
}

export function onRequest() {
  return response(405, { ok: false });
}

