const INDEX_KEY = 'indices/galeria-privada.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const resposta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return { uid: String(usuario.localId || ''), email: String(usuario.email).trim().toLowerCase() };
}

async function lerIndice(env) {
  const obxecto = await env.R2_PRIVADO.get(INDEX_KEY);
  if (!obxecto) return null;
  const indice = await obxecto.json().catch(() => null);
  return indice?.version && Array.isArray(indice.fotos) ? indice : null;
}

function respostaImaxe(obxecto) {
  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(obxecto.body, { headers });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'A galería privada non está configurada correctamente.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  let usuario;
  try { usuario = await verificarTokenFirebase(String(datos.idToken || ''), env.FIREBASE_API_KEY); }
  catch (erro) { console.error('Erro Firebase galería privada:', erro); }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const indice = await lerIndice(env);
  if (!indice) {
    return json(503, { ok: false, erro: 'O índice privado aínda non foi xerado polo sincronizador.' });
  }

  const accion = String(datos.accion || 'listar').trim();
  if (accion === 'listar') {
    const fotos = indice.fotos.map(({ rutaR2Privada, rutaMiniaturaPrivada, ...foto }) => foto);
    return json(200, { ok: true, xeradoEn: indice.xeradoEn, total: fotos.length, fotos }, {
      'Cache-Control': 'private, max-age=60',
      'X-SCPP-Galeria-Orige': 'R2'
    });
  }

  if (accion === 'imaxe') {
    const idFoto = String(datos.idFoto || '').trim();
    const miniatura = datos.miniatura === true;
    const foto = indice.fotos.find((item) => String(item.idFoto) === idFoto);
    const ruta = miniatura ? foto?.rutaMiniaturaPrivada : foto?.rutaR2Privada;
    if (!ruta) return json(404, { ok: false, erro: 'Non se atopou a fotografía privada' });
    const obxecto = await env.R2_PRIVADO.get(ruta);
    if (!obxecto) return json(404, { ok: false, erro: 'O ficheiro da fotografía non existe en R2' });
    return respostaImaxe(obxecto);
  }

  return json(400, { ok: false, erro: 'Acción non permitida' });
}
