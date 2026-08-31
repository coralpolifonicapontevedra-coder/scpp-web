export async function onRequestPost({ request, env }) {
  try {
    const { importe } = await request.json();

    if (!importe || isNaN(importe) || importe < 1) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Importe non válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Obtener variables de entorno configuradas en Cloudflare Pages
    const merchantId = env.CECA_MERCHANT_ID;
    const acquirerBin = env.CECA_ACQUIRER_BIN;
    const terminalId = env.CECA_TERMINAL_ID;
    const secretKey = env.CECA_SECRET_KEY;
    const urlTpv = env.CECA_URL || 'https://tpv.ceca.es/cgi-bin/tpv';

    if (!merchantId || !secretKey) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Faltan claves de configuración do TPV no servidor.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convertir importe a céntimos (ej. 25.00 € -> "2500")
    const importeCentimos = Math.round(parseFloat(importe) * 100).toString();
    const numPedido = Date.now().toString().slice(-12);
    const numMoneda = '978'; // EUR

    // Generar la firma SHA-256 requerida por CECA
    const cadenaFirma = `${secretKey}${merchantId}${acquirerBin}${terminalId}${numPedido}${importeCentimos}${numMoneda}SHA256`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(cadenaFirma);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const firma = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

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
          Exponente: '2',
          Pago_soportado: 'SSL',
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