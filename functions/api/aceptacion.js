/**
 * Función de Cloudflare Pages para registrar la aceptación legal.
 *
 * Variables necesarias:
 * - APPS_SCRIPT_WEBAPP_URL
 * - WEB_WRITE_TOKEN
 */

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json(405, {
      ok: false,
      erro: 'Método non permitido'
    });
  }

  const appsScriptUrl = env.APPS_SCRIPT_WEBAPP_URL;
  const writeToken = env.WEB_WRITE_TOKEN;

  if (!appsScriptUrl || !writeToken) {
    return json(500, {
      ok: false,
      erro: 'Falta a configuración segura do servizo'
    });
  }

  let datos;

  try {
    datos = await request.json();
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
   * PENDENTE: validar aquí o contrasinal cun sistema de autenticación
   * seguro. Nunca debe enviarse nin gardarse en Google Sheets.
   *
   * Polo momento só se rexistra a aceptación; non se autoriza o acceso.
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
        ambito: String(
          datos.ambito || 'coralpolifonicapontevedra.org'
        ).trim()
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
}