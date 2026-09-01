export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const importe = body?.importe;
    const anonimo = body?.anonimo !== false;
    const nomeCompleto = String(body?.nomeCompleto || '').trim().slice(0, 120);
    const correoElectronico = String(body?.correoElectronico || '').trim().toLowerCase().slice(0, 160);

    if (!importe || isNaN(importe) || importe < 1) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Importe non válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!anonimo && !nomeCompleto) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Indica o nome e apelidos ou marca Donativo anónimo.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!anonimo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoElectronico)) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Indica un correo electrónico válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Credenciais de produción configuradas en Cloudflare Pages.
    // Normalizamos espazos/saltos de liña accidentais sen alterar ceros á esquerda.
    const merchantId = String(env.CECA_MERCHANT_ID || '').trim();
    const acquirerBin = String(env.CECA_ACQUIRER_BIN || '').trim();
    const terminalId = String(env.CECA_TERMINAL_ID || '').trim();
    const secretKey = String(env.CECA_SECRET_KEY || '').trim();

    // Pasarela oficial de produción CECA.
    const urlTpv = String(
      env.CECA_URL || 'https://pgw.ceca.es/tpvweb/tpv/compra.action'
    ).trim();

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
    const descripcion = anonimo
      ? 'Donativo anónimo - Sociedade Coral Polifónica de Pontevedra'
      : `Donativo - ${nomeCompleto}`.slice(0, 250);

    // Formato CECA para Cifrado=SHA2:
    // Clave_encriptacion + MerchantID + AcquirerBIN + TerminalID + Num_operacion +
    // Importe + TipoMoneda + Exponente + Cifrado + URL_OK + URL_NOK.
    // Descripcion é un dato informativo e non altera esta cadea de sinatura.
    const cadenaFirma = `${secretKey}${merchantId}${acquirerBin}${terminalId}${numPedido}${importeCentimos}${numMoneda}${exponente}${cifrado}${urlOk}${urlNok}`;

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
        numOperacion: numPedido,
        donante: {
          anonimo,
          nomeCompleto: anonimo ? '' : nomeCompleto,
          correoElectronico: anonimo ? '' : correoElectronico
        },
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
          Descripcion: descripcion,
          Firma: firma,
          URL_OK: urlOk,
          URL_NOK: urlNok
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, erro: err?.message || 'Error interno do servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
