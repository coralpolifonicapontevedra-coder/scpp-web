import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const MAX_BYTES = 12 * 1024 * 1024;
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
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
  return {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
}

function decodificarBase64(base64) {
  const binario = atob(String(base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function extensionPorMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function comprobarAdministracion(env, usuario) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Administración non autorizada');
}

async function obterOriginal(env, usuario, idFoto) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'obterFotoParaR2',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto,
    rowId: idFoto,
    // O editor necesita ler tamén fotografías pendentes antes de decidir o destino.
    // Estes valores só permiten obter o blob; non modifican a Sheet nin publican nada.
    publicarPrivada: true,
    publicarPublica: false
  }, { timeoutMs: 75_000, attemptTimeoutMs: 25_000 });

  if (!resultado?.ok || !resultado.base64 || !TIPOS.has(String(resultado.mimeType || '').toLowerCase())) {
    throw new Error(resultado?.erro || 'Non se puido obter a fotografía orixinal.');
  }

  return {
    ok: true,
    idFoto: String(resultado.idFoto || resultado.rowId || idFoto),
    mimeType: String(resultado.mimeType).toLowerCase(),
    base64: String(resultado.base64),
    publicarPublica: resultado.publicarPublica === true,
    publicarPrivada: resultado.publicarPrivada === true
  };
}

async function gardarEdicion(env, usuario, datos) {
  const idFoto = String(datos.idFoto || '').trim();
  const mimeType = String(datos.mimeType || '').trim().toLowerCase();
  const base64 = String(datos.base64 || '').trim();
  if (!idFoto || !TIPOS.has(mimeType) || !base64) throw new Error('Faltan datos da fotografía editada.');

  const bytes = decodificarBase64(base64);
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error('A versión editada supera o máximo permitido de 12 MB.');
  if (!env.R2_PRIVADO || !env.R2_PUBLICO) throw new Error('Os buckets R2 non están configurados.');

  const extension = extensionPorMime(mimeType);
  const marca = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rutaBase = `fotos/editadas/${idFoto}-${marca}.${extension}`;
  const metadata = {
    httpMetadata: { contentType: mimeType, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: {
      idFoto,
      tipo: 'edicion',
      editadaPor: usuario.email,
      editadaEn: new Date().toISOString()
    }
  };

  const publica = datos.publicarPublica === true;
  let rutaPublica = '';
  let rutaPrivada = '';

  await env.R2_PRIVADO.put(rutaBase, bytes, metadata);
  rutaPrivada = rutaBase;
  if (publica) {
    await env.R2_PUBLICO.put(rutaBase, bytes, metadata);
    rutaPublica = rutaBase;
  }

  const { resultado: gardado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'gardarRutasFotoR2',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto,
    rutaPublica,
    rutaPrivada
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });

  if (!gardado?.ok) throw new Error(gardado?.erro || 'A edición gardouse en R2, pero non se puideron actualizar as rutas na folla Fotos.');

  return {
    ok: true,
    idFoto,
    rutaPublica,
    rutaPrivada,
    mensaxe: 'Versión editada gardada en R2. O ficheiro orixinal consérvase sen cambios.'
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) return json(500, { ok: false, erro: 'O editor non está configurado correctamente.' });

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  let usuario;
  try { usuario = await verificarTokenFirebase(String(datos.idToken || ''), env.FIREBASE_API_KEY); }
  catch (erro) { console.error('Erro Firebase editor:', erro); }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  try {
    await comprobarAdministracion(env, usuario);
    const accion = String(datos.accion || '').trim();
    if (accion === 'obterOriginal') return json(200, await obterOriginal(env, usuario, String(datos.idFoto || datos.rowId || '').trim()));
    if (accion === 'gardarEdicion') return json(200, await gardarEdicion(env, usuario, datos));
    return json(400, { ok: false, erro: 'Acción non permitida' });
  } catch (erro) {
    console.error('Erro no editor de fotografías:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, { ok: false, erro: erro instanceof Error ? erro.message : 'O editor non está dispoñible neste momento.' });
  }
}
