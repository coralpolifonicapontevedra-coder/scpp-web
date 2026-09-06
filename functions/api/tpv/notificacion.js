import { obterJsonAppsScript } from '../../_lib/apps-script.js';

const clean = (value) => String(value ?? '').trim();

async function sha256(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase();
}

async function invalidarCacheDoazons(env) {
  if (!env.R2_PRIVADO?.delete) return;
  const rama = clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
  await env.R2_PRIVADO.delete(`doazons/cache-v1/${rama}/listado.json`).catch(() => {});
}

export async function onRequestPost({ request, env }) {
  try {
    const contentType = clean(request.headers.get('content-type')).toLowerCase();
    const form = contentType.includes('application/json')
      ? new URLSearchParams(await request.json())
      : new URLSearchParams(await request.text());

    const merchantId = clean(form.get('MerchantID'));
    const acquirerBin = clean(form.get('AcquirerBIN'));
    const terminalId = clean(form.get('TerminalID'));
    const numOperacion = clean(form.get('Num_operacion'));
    const importe = clean(form.get('Importe'));
    const tipoMoneda = clean(form.get('TipoMoneda'));
    const exponente = clean(form.get('Exponente'));
    const referencia = clean(form.get('Referencia'));
    const firmaRecibida = clean(form.get('Firma')).toLowerCase();

    const expectedMerchant = clean(env.CECA_MERCHANT_ID);
    const expectedAcquirer = clean(env.CECA_ACQUIRER_BIN);
    const expectedTerminal = clean(env.CECA_TERMINAL_ID);
    const secretKey = clean(env.CECA_SECRET_KEY);

    if (!secretKey || !env.WEB_WRITE_TOKEN) {
      return new Response('CONFIG_ERROR', { status: 500 });
    }

    if (
      !merchantId || !acquirerBin || !terminalId || !numOperacion || !importe ||
      !tipoMoneda || !exponente || !referencia || !firmaRecibida
    ) {
      return new Response('INVALID_REQUEST', { status: 400 });
    }

    if (
      merchantId !== expectedMerchant ||
      acquirerBin !== expectedAcquirer ||
      terminalId !== expectedTerminal
    ) {
      return new Response('INVALID_MERCHANT', { status: 403 });
    }

    const firmaEsperada = await sha256(
      `${secretKey}${merchantId}${acquirerBin}${terminalId}${numOperacion}${importe}${tipoMoneda}${exponente}${referencia}`
    );

    if (firmaEsperada !== firmaRecibida) {
      return new Response('INVALID_SIGNATURE', { status: 403 });
    }

    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'actualizarDoazonTPVPortal',
      numOperacionTPV: numOperacion,
      referenciaTPV: referencia,
      estadoPago: 'Pagado'
    }, {
      timeoutMs: 15000,
      attemptTimeoutMs: 8000
    });

    if (!resultado?.ok) {
      console.error('TPV notificación: non se puido actualizar a operación', resultado);
      return new Response('UPDATE_ERROR', { status: 500 });
    }

    await invalidarCacheDoazons(env);

    // Código de resposta requerido por CECA para a comunicación on-line OK.
    return new Response('$*$OKY$*$', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (error) {
    console.error('TPV notificación:', error);
    return new Response('INTERNAL_ERROR', { status: 500 });
  }
}
