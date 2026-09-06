const clean = (value) => String(value ?? '').trim();

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function registrarOperacion(env, datos) {
  const endpoint = clean(env.APPS_SCRIPT_WEBAPP_URL);
  const token = clean(env.WEB_WRITE_TOKEN);
  if (!endpoint || !token) return;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token,
        accion: 'crearDoazonTPVPortal',
        numOperacionTPV: datos.numOperacionTPV,
        importe: datos.importe,
        anonimo: datos.anonimo,
        nome: datos.nome,
        correo: datos.correo
      }),
      redirect: 'follow'
    });
  } catch (error) {
    console.error('TPV: non foi posible rexistrar a operación en segundo plano:', error);
  }

  if (env.R2_PRIVADO?.delete) {
    const rama = clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
    await env.R2_PRIVADO.delete(`doazons/cache-v1/${rama}/listado.json`).catch(() => {});
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { ok: false, erro: 'Petición non válida.' });
    }

    const importe = Number(body?.importe);
    const anonimo = body?.anonimo === true;
    const nome = anonimo ? '' : clean(body?.nome);
    const correo = anonimo ? '' : clean(body?.correo).toLowerCase();

    if (!Number.isFinite(importe) || importe < 1 || importe > 5000) {
      return json(400, { ok: false, erro: 'Importe non válido.' });
    }
    if (!anonimo && !nome) {
      return json(400, { ok: false, erro: 'Indica o nome ou marca a doazón como anónima.' });
    }

    const merchantId = clean(env.CECA_MERCHANT_ID);
    const acquirerBin = clean(env.CECA_ACQUIRER_BIN);
    const terminalId = clean(env.CECA_TERMINAL_ID);
    const secretKey = clean(env.CECA_SECRET_KEY || env.CECA_ENCRYPTION_KEY);
    const urlTpv = clean(env.CECA_URL || 'https://pgw.ceca.es/tpvweb/tpv/compra.action');

    if (!merchantId || !acquirerBin || !terminalId || !secretKey) {
      return json(503, { ok: false, erro: 'A pasarela de pago non está configurada correctamente.' });
    }

    const importeCentimos = Math.round(importe * 100).toString();
    const numPedido = Date.now().toString().slice(-12);
    const numMoneda = '978';
    const exponente = '2';
    const cifrado = 'SHA2';
    const urlOk = 'https://coralpolifonicapontevedra.org/donar/?resultado=ok';
    const urlNok = 'https://coralpolifonicapontevedra.org/donar/?resultado=error';

    // Mantemos a sinatura do fluxo CECA que xa funcionaba en produción.
    // O rexistro interno faise en segundo plano e nunca bloquea o paso ao banco.
    const cadenaFirma = `${secretKey}${merchantId}${acquirerBin}${terminalId}${numPedido}${importeCentimos}${numMoneda}${exponente}${cifrado}${urlOk}${urlNok}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cadenaFirma));
    const firma = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();

    const rexistro = registrarOperacion(env, {
      numOperacionTPV: numPedido,
      importe,
      anonimo,
      nome,
      correo
    });
    if (typeof context.waitUntil === 'function') context.waitUntil(rexistro);
    else rexistro.catch(() => {});

    return json(200, {
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
    });
  } catch (error) {
    console.error('TPV pago:', error);
    return json(500, { ok: false, erro: 'Non foi posible iniciar o pago neste momento.' });
  }
}

export function onRequest() {
  return json(405, { ok: false, erro: 'Método non permitido.' });
}
