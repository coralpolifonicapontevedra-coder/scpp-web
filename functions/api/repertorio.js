const FIREBASE_API_KEY = 'AIzaSyDrQY7NsaKpBfrSc8GqV3lUQDOIkecPZbs';

const json = (status, body) => new Response(JSON.stringify(body), {
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
}

function respostaFicheiro(resultado) {
  const binario = atob(String(resultado.base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const nome = String(resultado.nomeFicheiro || 'ficheiro').replace(/[\r\n"]/g, '');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': String(resultado.mimeType || 'application/octet-stream'),
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.APPS_SCRIPT_WEBAPP_URL || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'Falta a configuración segura do servizo' });
  }

  let datos;
  try { datos = await request.json(); } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try {
    usuario = await verificarTokenFirebase(String(datos.idToken || '').trim());
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const accion = String(datos.accion || 'listarRepertorioPortal').trim();
  if (!['listarRepertorioPortal', 'obterFicheiroRepertorio'].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  try {
    const resposta = await fetch(env.APPS_SCRIPT_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: env.WEB_WRITE_TOKEN,
        accion,
        email: usuario.email,
        uidFirebase: usuario.uid,
        ruta: String(datos.ruta || '').trim()
      })
    });
    const texto = await resposta.text();
    let resultado;
    try { resultado = JSON.parse(texto); } catch {
      return json(502, { ok: false, erro: 'O servizo devolveu unha resposta non válida' });
    }
    if (!resultado.ok) {
      return json(resultado.erro === 'Usuario non autorizado' ? 403 : 400, resultado);
    }
    if (accion === 'obterFicheiroRepertorio') return respostaFicheiro(resultado);
    return json(200, resultado);
  } catch (erro) {
    console.error(erro);
    return json(502, { ok: false, erro: 'Non foi posible contactar co servizo de repertorio' });
  }
}
