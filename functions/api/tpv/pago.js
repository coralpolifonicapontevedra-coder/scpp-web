export async function onRequestPost({ request, env }) {
  try {
    const { importe } = await request.json();

    if (!importe || isNaN(importe) || importe < 1) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Importe non válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Credenciales de producción configuradas en Cloudflare Pages
    const merchantId = env.CECA_MERCHANT_ID;
    const acquirerBin = env.CECA_ACQUIRER_BIN;
    const terminalId = env.CECA_TERMINAL_ID;
    const secretKey = env.CECA_SECRET_KEY;
    
    // URL principal del CGI de producción
    const urlTpv = env.CECA_URL || 'https://tpv.ceca.es/cgi-bin/tpv';

    if (!merchantId || !secretKey) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Faltan claves de configuración do TPV no servidor.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const importeCentimos = Math.round(parseFloat(importe) * 100).toString();
    const numPedido = Date.now().toString().slice(-12);
    const numMoneda = '978'; // EUR
    const exponente = '2';

    // Cadena exacta para el hash SHA-256 de CECA
    const cadenaFirma = `${secretKey}${merchantId}${acquirerBin}${terminalId}${numPedido}${importeCentimos}${numMoneda}${exponente}SHA256`;

    const encoder = new TextEncoder();
    const data = encoder.encode(cadenaFirma);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    // CECA requiere el hash resultante formateado en minúsculas
    const firma = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();

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
          Cifrado: 'SHA256',
          Pago_soportado: 'SSL',
          Idioma: '1',
          Firma: firma,
          URL_OK: 'https://coralpolifonicapontevedra.org/donar/?resultado=ok',
          URL_NOK: 'https://coralpolifonicapontevedra.org/donar/?resultado=error'
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