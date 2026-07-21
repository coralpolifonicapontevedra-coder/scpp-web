/**
 * Función de Cloudflare Pages para validar a identidade con Firebase
 * e rexistrar a aceptación legal.
 *
 * Variables necesarias en Cloudflare Pages:
 * - APPS_SCRIPT_WEBAPP_URL
 * - WEB_WRITE_TOKEN
 *
 * A clave web de Firebase é un identificador público, igual que no
 * firebaseConfig que se entrega ao navegador. Non é un contrasinal.
 */

const FIREBASE_API_KEY =
  'AIzaSyDrQY7NsaKpBfrSc8GqV3lUQDOIkecPZbs';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });

async function verificarTokenFirebase(idToken) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ idToken })
    }
  );

  if (!resposta.ok) {
    return null;
  }

  const resultado = await resposta.json();
  const usuario = resultado?.users?.[0];

  if (!usuario?.email || usuario.emailVerified !== true) {
    return null;
  }

  return {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
}

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

  const idToken = String(datos.idToken || '').trim();
  const textoLegal = String(datos.textoLegal || '').trim();
  const version = String(datos.version || '').trim();

  if (!idToken) {
    return json(401, {
      ok: false,
      erro: 'É necesario identificarse de novo'
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

  let usuarioFirebase;

  try {
    usuarioFirebase = await verificarTokenFirebase(idToken);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }

  if (!usuarioFirebase) {
    return json(401, {
      ok: false,
      erro: 'A identificación non é válida ou caducou'
    });
  }

  try {
    const respostaAppsScript = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        token: writeToken,
        accion: 'rexistrarAceptacion',
        email: usuarioFirebase.email,
        uidFirebase: usuarioFirebase.uid,
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
      const nonAutorizado =
        resultado.erro === 'Usuario non autorizado';

      return json(nonAutorizado ? 403 : 400, resultado);
    }

    return json(200, {
      ok: true,
      email: usuarioFirebase.email,
      mensaxe: 'Aceptación rexistrada correctamente',
      redirect: resultado.redirect || ''
    });
  } catch (erro) {
    console.error(erro);

    return json(502, {
      ok: false,
      erro: 'Non foi posible contactar co servizo de aceptación'
    });
  }
}
