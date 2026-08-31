export async function onRequestPost({ request, env }) {
  try {
    const { importe } = await request.json();

    if (!importe || isNaN(importe) || importe < 1) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Importe non válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Credenciais de produción configuradas en Cloudflare Pages
    const merchantId = env.CECA_MERCHANT_ID;
    const acquirerBin = env.CECA_ACQUIRER_BIN;
    const terminalId = env.CECA_TERMINAL_ID;
    const secretKey = env.CECA_SECRET_KEY;

    // Pasarela oficial de produción CECA
    const urlTpv = env.CECA_URL || 'https://pgw.ceca.es/tpvweb/tpv/compra.action';

    if (!merchantId || !acquirerBin || !terminalId || !secretKey) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Faltan claves de configuración do TPV no servidor.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const importeCentimos = Math.round(parseFloat(importe) * 100).toString();
    const numPedido = Date.now().toString().slice(-12);
    const numMoneda = '978';
    const exponente = '2';
    const cifrado = 'SHA2';
    const urlOk = 'https://coralpolifonicapontevedra.org/donar/?resultado=ok';
    const urlNok = 'https://coralpolifonicapontevedra.org/donar/?resultado=error';
    const exencionSca = '';

    // Formato oficial CECA para Cifrado=SHA2:
    // Clave_encriptacion + MerchantID + AcquirerBIN + TerminalID + Num_operacion +
    // Importe + TipoMoneda + Exponente + Cifrado + URL_OK + URL_NOK + Exencion_SCA
    const cadenaFirma = `${secretKey}${merchantId}${acquirerBin}${terminalId}${numPedido}${importeCentimos}${numMoneda}${exponente}${cifrado}${urlOk}${urlNok}${exencionSca}`;

    const encoder = new TextEncoder();
    const data = encoder.encode(cadenaFirma);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const firma = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();

    return new Response(
      JSON.stringify({
        ok: true,
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
          Firma: firma,
          URL_OK: urlOk,
          URL_NOK: urlNok
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, erro: err.message || 'Error interno do servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
