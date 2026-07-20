/**
 * netlify/functions/aceptacion.mjs
 *
 * Variables necesarias en Netlify:
 * - APPS_SCRIPT_WEBAPP_URL
 * - WEB_WRITE_TOKEN
 *
 * IMPORTANTE:
 * Esta función protege el token y reenvía la aceptación a Apps Script.
 * Antes de abrir el portal privado debe añadirse aquí la validación real
 * de la contraseña. En el estado actual no se concede acceso ni se devuelve
 * ninguna ruta de redirección.
 */

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, {
      ok: false,
      erro: 'Método non permitido'
    });
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_WEBAPP_URL;
  const writeToken = process.env.WEB_WRITE_TOKEN;

  if (!appsScriptUrl || !writeToken) {
    return json(500, {
      ok: false,
      erro: 'Falta a configuración segura do servizo'
    });
  }

  let datos;

  try {
    datos = JSON.parse(event.body || '{}');
  } catch {
    return json(400, {
      ok: false,
      erro: 'Solicitude non válida'
    });
  }

  const email = String(datos.email || '')
    .trim()
    .toLowerCase();

  const password = String(datos.password || '');
  const textoLegal = String(datos.textoLegal || '').trim();
  const version = String(datos.version || '').trim();

  if (!email || !password) {
    return json(400, {
      ok: false,
      erro: 'Introduce o correo e o contrasinal'
    });
  }

  if (datos.aceptaFines !== true) {
    return json(400, {
      ok: false,
      erro: 'É necesario confirmar a aceptación'
    });
  }

  if (!textoLegal || !version) {
    return json(400, {
      ok: false,
      erro: 'Falta o texto legal ou a súa versión'
    });
  }

  /*
   * PENDENTE: validar aquí a contraseña contra un sistema de autenticación
   * seguro. Nunca debe enviarse ni gardarse en Google Sheets.
   *
   * Por agora a función só rexistra a aceptación; non autoriza o acceso.
   */

  try {
    const respostaAppsScript = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        token: writeToken,
        accion: 'rexistrarAceptacion',
        email,
        version,
        textoLegal,
        aceptaFines: true,
        ambito:
          String(datos.ambito || 'coralpolifonicapontevedra.org').trim()
      })
    });

    const textoResposta = await respostaAppsScript.text();

    let resultado;

    try {
      resultado = JSON.parse(textoResposta);
    } catch {
      return json(502, {
        ok: false,
        erro: 'O servizo devolveu unha resposta non válida'
      });
    }

    if (!resultado.ok) {
      return json(400, resultado);
    }

    return json(200, {
      ok: true,
      mensaxe: 'Aceptación rexistrada correctamente'
    });
  } catch (erro) {
    console.error(erro);

    return json(502, {
      ok: false,
      erro: 'Non foi posible contactar co servizo de aceptación'
    });
  }
};
