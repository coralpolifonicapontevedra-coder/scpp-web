import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const MAX_BYTES = 12 * 1024 * 1024;
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SESION_MS = 30 * 60 * 1000;

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

const sesionKey = (uid) => `editor/sesions/${uid}.json`;
const estadoKey = (idFoto) => `editor/estado/${idFoto}.json`;

async function gardarJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, no-store'
    }
  });
}

async function crearSesionEditor(env, usuario) {
  const sesion = {
    uid: usuario.uid,
    email: usuario.email,
    creadaEn: new Date().toISOString(),
    caducaEn: new Date(Date.now() + SESION_MS).toISOString()
  };
  await gardarJson(env.R2_PRIVADO, sesionKey(usuario.uid), sesion);
}

async function validarSesionEditor(env, usuario) {
  const obxecto = await env.R2_PRIVADO.get(sesionKey(usuario.uid));
  if (!obxecto) return false;
  try {
    const sesion = await obxecto.json();
    return String(sesion?.email || '').toLowerCase() === usuario.email &&
      Date.parse(String(sesion?.caducaEn || '')) > Date.now();
  } catch {
    return false;
  }
}

async function comprobarAdministracion(env, usuario) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Administración non autorizada');
  await crearSesionEditor(env, usuario);
}

async function obterOriginal(env, usuario, idFoto) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'obterFotoParaR2',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto,
    rowId: idFoto,
    publicarPrivada: true,
    publicarPublica: false
  }, { timeoutMs: 75_000, attemptTimeoutMs: 25_000 });

  if (!resultado?.ok || !resultado.base64 || !TIPOS.has(String(resultado.mimeType || '').toLowerCase())) {
    throw new Error(resultado?.erro || 'Non se puido obter a fotografía orixinal.');
  }

  await crearSesionEditor(env, usuario);
  return {
    ok: true,
    idFoto: String(resultado.idFoto || resultado.rowId || idFoto),
    mimeType: String(resultado.mimeType).toLowerCase(),
    base64: String(resultado.base64),
    publicarPublica: resultado.publicarPublica === true,
    publicarPrivada: resultado.publicarPrivada === true
  };
}

async function sincronizarSheet(env, usuario, traballo) {
  const estadoBase = {
    idFoto: traballo.idFoto,
    rutaPublica: traballo.rutaPublica,
    rutaPrivada: traballo.rutaPrivada,
    actualizadoEn: new Date().toISOString()
  };

  try {
    const { resultado: rutas } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'gardarRutasFotoR2',
      email: usuario.email,
      uidFirebase: usuario.uid,
      idFoto: traballo.idFoto,
      rutaPublica: traballo.rutaPublica,
      rutaPrivada: traballo.rutaPrivada
    }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });
    if (!rutas?.ok) throw new Error(rutas?.erro || 'Non se puideron gardar as rutas na Sheet.');

    const { resultado: revision } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'actualizarRevisionFoto',
      email: usuario.email,
      uidFirebase: usuario.uid,
      rowId: traballo.idFoto,
      idFoto: traballo.idFoto,
      estado: 'Aprobada',
      publicarPublica: traballo.publicarPublica,
      publicarPrivada: traballo.publicarPrivada,
      destacadaPublica: traballo.destacadaPublica,
      destacadaPrivada: traballo.destacadaPrivada,
      titulo: traballo.titulo,
      peFoto: traballo.peFoto,
      observacions: traballo.observacions
    }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });
    if (!revision?.ok) throw new Error(revision?.erro || 'Non se puido completar a publicación.');

    await gardarJson(env.R2_PRIVADO, estadoKey(traballo.idFoto), {
      ...estadoBase,
      estado: 'sincronizada',
      mensaxe: 'Edición gardada e publicación sincronizada.'
    });
  } catch (erro) {
    console.error('Erro ao sincronizar edición coa Sheet:', erro);
    await gardarJson(env.R2_PRIVADO, estadoKey(traballo.idFoto), {
      ...estadoBase,
      estado: 'erro',
      erro: erro instanceof Error ? erro.message : 'Erro descoñecido ao sincronizar.'
    });
  }
}

async function gardarEdicion(env, usuario, datos, waitUntil) {
  const idFoto = String(datos.idFoto || '').trim();
  const mimeType = String(datos.mimeType || '').trim().toLowerCase();
  const base64 = String(datos.base64 || '').trim();
  if (!idFoto || !TIPOS.has(mimeType) || !base64) throw new Error('Faltan datos da fotografía editada.');

  if (!(await validarSesionEditor(env, usuario))) {
    throw new Error('A autorización temporal do editor caducou. Volve cargar a fotografía.');
  }

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

  const publicarPublica = datos.publicarPublica === true;
  const publicarPrivada = datos.publicarPrivada === true;
  const modo = String(datos.modo || 'borrador') === 'publicar' ? 'publicar' : 'borrador';

  await env.R2_PRIVADO.put(rutaBase, bytes, metadata);
  const rutaPrivada = rutaBase;
  let rutaPublica = '';
  if (publicarPublica) {
    await env.R2_PUBLICO.put(rutaBase, bytes, metadata);
    rutaPublica = rutaBase;
  }

  const traballo = {
    idFoto,
    rutaPublica,
    rutaPrivada,
    publicarPublica,
    publicarPrivada,
    destacadaPublica: datos.destacadaPublica === true,
    destacadaPrivada: datos.destacadaPrivada === true,
    titulo: String(datos.titulo || '').trim(),
    peFoto: String(datos.peFoto || '').trim(),
    observacions: String(datos.observacions || '').trim()
  };

  await gardarJson(env.R2_PRIVADO, estadoKey(idFoto), {
    idFoto,
    estado: modo === 'publicar' ? 'pendente' : 'borrador',
    rutaPublica,
    rutaPrivada,
    actualizadoEn: new Date().toISOString(),
    mensaxe: modo === 'publicar'
      ? 'A edición xa está en R2. A publicación está sincronizándose.'
      : 'Borrador editado gardado en R2; o orixinal consérvase.'
  });

  if (modo === 'publicar') {
    waitUntil(sincronizarSheet(env, usuario, traballo));
  }

  return {
    ok: true,
    idFoto,
    estado: modo === 'publicar' ? 'pendente' : 'borrador',
    rutaPublica,
    rutaPrivada,
    mensaxe: modo === 'publicar'
      ? 'Edición gardada en R2. A publicación continúa en segundo plano.'
      : 'Borrador editado gardado en R2. O orixinal consérvase sen cambios.'
  };
}

async function obterEstado(env, idFoto) {
  const obxecto = await env.R2_PRIVADO.get(estadoKey(String(idFoto || '').trim()));
  if (!obxecto) return { ok: true, estado: 'sen-datos' };
  try {
    return { ok: true, ...(await obxecto.json()) };
  } catch {
    return { ok: true, estado: 'sen-datos' };
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O editor non está configurado correctamente.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  let usuario;
  try { usuario = await verificarTokenFirebase(String(datos.idToken || ''), env.FIREBASE_API_KEY); }
  catch (erro) { console.error('Erro Firebase editor:', erro); }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || '').trim();
  try {
    if (accion === 'obterOriginal') {
      await comprobarAdministracion(env, usuario);
      return json(200, await obterOriginal(env, usuario, String(datos.idFoto || datos.rowId || '').trim()));
    }
    if (accion === 'gardarEdicion') {
      return json(200, await gardarEdicion(env, usuario, datos, context.waitUntil.bind(context)));
    }
    if (accion === 'estadoEdicion') {
      if (!(await validarSesionEditor(env, usuario))) return json(403, { ok: false, erro: 'Sesión do editor caducada' });
      return json(200, await obterEstado(env, datos.idFoto));
    }
    return json(400, { ok: false, erro: 'Acción non permitida' });
  } catch (erro) {
    console.error('Erro no editor de fotografías:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, { ok: false, erro: erro instanceof Error ? erro.message : 'O editor non está dispoñible neste momento.' });
  }
}
