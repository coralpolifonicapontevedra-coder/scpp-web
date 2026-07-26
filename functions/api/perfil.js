const TIPOS_FOTO = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FOTO_BYTES = 2 * 1024 * 1024;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
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

const texto = (valor, maximo = 5000) =>
  String(valor == null ? '' : valor).trim().slice(0, maximo);

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.APPS_SCRIPT_WEBAPP_URL || !env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'Falta a configuración segura do servizo' });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  const idToken = texto(datos.idToken, 10000);
  let usuario;
  try {
    usuario = idToken && await verificarTokenFirebase(idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }

  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const accion = texto(datos.accion || 'obterPerfil', 40);
  if (!new Set(['obterPerfil', 'actualizarPerfil']).has(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  const fotoBase64 = texto(datos.fotoBase64, 4 * 1024 * 1024);
  const fotoTipo = texto(datos.fotoTipo, 80).toLowerCase();

  if (accion === 'actualizarPerfil' && fotoBase64) {
    if (!TIPOS_FOTO.has(fotoTipo)) {
      return json(400, { ok: false, erro: 'O formato da fotografía non é compatible' });
    }
    if (Math.floor((fotoBase64.length * 3) / 4) > MAX_FOTO_BYTES) {
      return json(413, { ok: false, erro: 'A fotografía de perfil supera o máximo permitido' });
    }
  }

  const corpo = {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: usuario.email,
    uidFirebase: usuario.uid
  };

  if (accion === 'actualizarPerfil') {
    Object.assign(corpo, {
      telefono: texto(datos.telefono, 40),
      correoElectronico: texto(datos.correoElectronico, 160),
      enderezo: texto(datos.enderezo, 240),
      cidade: texto(datos.cidade, 120),
      cp: texto(datos.cp, 10),
      dataNacemento: texto(datos.dataNacemento, 20),
      contactoEmerxencia: texto(datos.contactoEmerxencia, 180),
      telefonoEmerxencia: texto(datos.telefonoEmerxencia, 40),
      preferenciaComunicacion: texto(datos.preferenciaComunicacion, 60),
      consentimentoFoto: texto(datos.consentimentoFoto, 80),
      mostrarAniversario: datos.mostrarAniversario === true,
      fotoBase64,
      fotoTipo,
      fotoNome: texto(datos.fotoNome, 160)
    });
  }

  try {
    const resposta = await fetch(env.APPS_SCRIPT_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo)
    });

    const textoResposta = await resposta.text();
    let resultado;
    try {
      resultado = JSON.parse(textoResposta);
    } catch {
      return json(502, { ok: false, erro: 'O servizo devolveu unha resposta non válida' });
    }

    if (!resultado.ok) {
      const estado = resultado.erro === 'Usuario non autorizado' ? 403 : 400;
      return json(estado, resultado);
    }

    return json(200, resultado);
  } catch (erro) {
    console.error(erro);
    return json(502, { ok: false, erro: 'Non foi posible contactar co servizo de perfil' });
  }
}
