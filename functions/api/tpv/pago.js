import { obterJsonAppsScript } from '../../_lib/apps-script.js';

const clean = (value) => String(value ?? '').trim();

async function invalidarCacheDoazons(env) {
  if (!env.R2_PRIVADO?.delete) return;
  const rama = clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
  await env.R2_PRIVADO.delete(`doazons/cache-v1/${rama}/listado.json`).catch(() => {});
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const importe = Number(body?.importe);
    const anonimo = body?.anonimo !== false;
    const nome = anonimo ? '' : clean(body?.nome);
    const correo = anonimo ? '' : clean(body?.correo).toLowerCase();

    if (!importe || !Number.isFinite(importe) || importe < 1) {
      return new Response(JSON.stringify({ ok: false, erro: 'Importe non válido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!anonimo && !nome) {
      return new Response(JSON.stringify({ ok: false, erro: 'Indica o nome ou marca a doazón como anónima.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.WEB_WRITE_TOKEN) {
      return new Response(JSON.stringify({ ok: false, erro: 'Non está configurada a escritura segura de doazóns.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const merchantId = clean(env.CECA_MERCHANT_ID);
    const acquirerBin = clean(env.CECA_ACQUIRER_BIN);
    const terminalId = clean(env.CECA_TERMINAL_ID);
    const secretKey = clean(env.CECA_SECRET_KEY);
    const urlTpv = clean(env.CECA_URL || 'https://pgw.ceca.es/tpvweb/tpv/compra.action');

    if (!merchantId || !acquirerBin || !terminalId || !secretKey) {
      return new Response(JSON.stringify({ ok: false, erro: 'Faltan claves de configuración do TPV no servidor.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const importeCentimos = Math.round(importe * 100).toString();
    const numPedido = Date.now().toString().slice(-12);
    const numMoneda = '978';
    const exponente = '2';
    const cifrado = 'SHA2';
    const urlOk = 'https://coralpolifonicapontevedra.org/donar/?resultado=ok';
    const urlNok = 'https://coralpolifonicapontevedra.org/donar/?resultado=error';

    // Primeiro rexistramos a operación na Sheet. Se isto falla, non enviamos
    // ao doante ao banco para non crear un cobro sen trazabilidade interna.
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'crearDoazonTPVPortal',
      numOperacionTPV: numPedido,
      importe,
      anonimo,
      nome,
      correo
    }, {
      timeoutMs: 15000,
      attemptTimeoutMs: 8000
    });

    if (!resultado?.ok) {
      return new Response(JSON.stringify({
        ok: false,
        erro: resultado?.erro || 'Non foi posible rexistrar a operación antes de abrir o TPV.'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await invalidarCacheDoazons(env);

    const cadenaFirma = `${secretKey}${merchantId}${acquirerBin}${terminalId}${numPedido}${importeCentimos}${numMoneda}${exponente}${cifrado}${urlOk}${urlNok}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cadenaFirma));
    const firma = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();

    return new Response(JSON.stringify({
      ok: true,
      operacion: numPedido,
      url: urlTpv,
      params: {
        MerchantID: merchantId,
        AcquirerBIN: acquirerBin,
        TerminalID: terminalId,
        Num_operacion: numPedido,
        Importe: importeCentimos,
        TipoMoneda: numMoneda,
        Exponente: exponente,
        Cifrado: cifrado,
        Pago_soportado: 'SSL',
        Idioma: '1',
        Descripcion: 'Doazón Sociedade Coral Polifónica de Pontevedra',
        Firma: firma,
        URL_OK: urlOk,
        URL_NOK: urlNok
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('TPV pago:', err);
    return new Response(JSON.stringify({ ok: false, erro: err instanceof Error ? err.message : 'Error interno do servidor.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
