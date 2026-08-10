import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const MAX_BYTES = 12 * 1024 * 1024;
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUTH_TTL_MS = 15 * 60 * 1000;
const AUTH_CACHE_VERSION = 2;

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

function decodificarBase64(base64) {
  const binario = atob(String(base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

function codificarBase64(bytes) {
  const bloque = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += bloque) {
    binario += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + bloque, bytes.length))
    );
  }
  return btoa(binario);
}

function extensionPorMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function claveCorreo(email) {
  const datos = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)]
    .map((valor) => valor.toString(16).padStart(2, '0'))
    .join('');
}

async function comprobarAdministracion(env, usuario) {
  if (!env.R2_PRIVADO) throw new Error('R2 privado non está configurado.');

  const clave = await claveCorreo(usuario.email);
  const ruta = `cache/autorizacion-fotos/${clave}.json`;
  const gardada = await env.R2_PRIVADO.get(ruta);

  if (gardada) {
    const datos = await gardada.json().catch(() => null);
    const verificadaEn = Date.parse(String(datos?.verificadaEn || ''));
    if (
      datos?.version === AUTH_CACHE_VERSION &&
      datos?.administrador === true &&
      Number.isFinite(verificadaEn) &&
      Date.now() - verificadaEn < AUTH_TTL_MS
    ) {
      return;
    }
  }

  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });

  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Administración non autorizada');
  }
  if (Object.prototype.hasOwnProperty.call(resultado || {}, 'administrador') && resultado?.administrador !== true) {
    throw new Error('Administración non autorizada');
  }

  await env.R2_PRIVADO.put(ruta, JSON.stringify({
    version: AUTH_CACHE_VERSION,
    administrador: true,
    email: usuario.email,
    verificadaEn: new Date().toISOString()
  }), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, max-age=900'
    }
  });
}

async function obterOriginalR2(env, idFoto) {
  if (!env.R2_PRIVADO) throw new Error('R2 privado non está configurado.');

  const indice = await env.R2_PRIVADO.get(`fotos/traballo/${idFoto}.json`);
  if (!indice) {
    return {
      ok: false,
      pendentePreparacion: true,
      erro: 'A fotografía aínda non está preparada en R2 privado.'
    };
  }

  const datos = await indice.json().catch(() => null);
  const ruta = String(datos?.ruta || '').trim();
  const mimeType = String(datos?.mimeType || '').trim().toLowerCase();

  if (!ruta || !TIPOS.has(mimeType)) {
    return {
      ok: false,
      pendentePreparacion: true,
      erro: 'O índice privado da fotografía non é válido.'
    };
  }

  const obxecto = await env.R2_PRIVADO.get(ruta);
  if (!obxecto) {
    return {
      ok: false,
      pendentePreparacion: true,
      erro: 'A copia privada da fotografía non está dispoñible en R2.'
    };
  }

  const bytes = new Uint8Array(await obxecto.arrayBuffer());
  return {
    ok: true,
    idFoto,
    mimeType,
    base64: codificarBase64(bytes),
    publicarPublica: datos.publicarPublica === true,
    publicarPrivada: datos.publicarPrivada === true,
    orixe: 'R2'
  };
}

async function escribirEstado(env, idFoto, estado) {
  if (!env.R2_PRIVADO) return;
  await env.R2_PRIVADO.put(
    `fotos/estado-edicion/${idFoto}.json`,
    JSON.stringify({
      idFoto,
      ...estado,
      actualizadoEn: new Date().toISOString()
    }),
    {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'no-store'
      }
    }
  );
}

async function sincronizarSheet(env, usuario, datos, rutas) {
  const idFoto = String(datos.idFoto || '').trim();

  try {
    await escribirEstado(env, idFoto, { estado: 'sincronizando' });

    const publicarPublica = datos.publicarPublica === true;
    const publicarPrivada = datos.publicarPrivada === true;
    const estado = String(datos.estado || 'Aprobada').trim();

    const { resultado: revision } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'actualizarRevisionFoto',
      email: usuario.email,
      uidFirebase: usuario.uid,
      rowId: idFoto,
      idFoto,
      estado,
      publicarPublica,
      publicarPrivada,
      destacadaPublica: publicarPublica && datos.destacadaPublica === true,
      destacadaPrivada: publicarPrivada && datos.destacadaPrivada === true,
      titulo: String(datos.titulo || '').trim(),
      peFoto: String(datos.peFoto || '').trim(),
      observacions: String(datos.observacions || '').trim()
    }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });

    if (!revision?.ok) {
      throw new Error(revision?.erro || 'Non se puido actualizar a revisión.');
    }

    const { resultado: gardado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'gardarRutasFotoR2',
      email: usuario.email,
      uidFirebase: usuario.uid,
      idFoto,
      rowId: idFoto,
      rutaPublica: rutas.rutaPublica,
      rutaPrivada: rutas.rutaPrivada
    }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });

    if (!gardado?.ok) {
      throw new Error(gardado?.erro || 'Non se puideron gardar as rutas R2.');
    }

    await escribirEstado(env, idFoto, {
      estado: 'sincronizada',
      rutaPublica: rutas.rutaPublica,
      rutaPrivada: rutas.rutaPrivada
    });
  } catch (erro) {
    console.error('Erro ao sincronizar edición coa Sheet:', erro);
    await escribirEstado(env, idFoto, {
      estado: 'erro',
      erro: erro instanceof Error ? erro.message : String(erro)
    });
  }
}

async function gardarEdicion(env, usuario, datos, context) {
  const idFoto = String(datos.idFoto || '').trim();
  const mimeType = String(datos.mimeType || '').trim().toLowerCase();
  const base64 = String(datos.base64 || '').trim();

  if (!idFoto || !TIPOS.has(mimeType) || !base64) {
    throw new Error('Faltan datos da fotografía editada.');
  }

  const bytes = decodificarBase64(base64);
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) {
    throw new Error('A versión editada supera o máximo permitido de 12 MB.');
  }
  if (!env.R2_PRIVADO || !env.R2_PUBLICO) {
    throw new Error('Os buckets R2 non están configurados.');
  }

  const extension = extensionPorMime(mimeType);
  const marca = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rutaBase = `fotos/editadas/${idFoto}-${marca}.${extension}`;
  const metadata = {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: {
      idFoto,
      tipo: 'edicion',
      editadaPor: usuario.email,
      editadaEn: new Date().toISOString()
    }
  };

  const publicarPublica = datos.publicarPublica === true;
  let rutaPublica = '';
  const rutaPrivada = rutaBase;

  await env.R2_PRIVADO.put(rutaBase, bytes, metadata);
  if (publicarPublica) {
    await env.R2_PUBLICO.put(rutaBase, bytes, metadata);
    rutaPublica = rutaBase;
  }

  await escribirEstado(env, idFoto, {
    estado: 'pendente',
    rutaPublica,
    rutaPrivada
  });

  const tarefa = sincronizarSheet(env, usuario, datos, {
    rutaPublica,
    rutaPrivada
  });

  if (context?.waitUntil) {
    context.waitUntil(tarefa);
  } else {
    tarefa.catch((erro) => {
      console.error('Sincronización diferida fallida:', erro);
    });
  }

  return {
    ok: true,
    idFoto,
    rutaPublica,
    rutaPrivada,
    sincronizacion: 'pendente',
    mensaxe: 'A versión editada gardouse en R2. A actualización da Sheet continúa en segundo plano.'
  };
}

async function obterEstado(env, idFoto) {
  if (!env.R2_PRIVADO) throw new Error('R2 privado non está configurado.');
  const obxecto = await env.R2_PRIVADO.get(
    `fotos/estado-edicion/${idFoto}.json`
  );
  if (!obxecto) return { ok: true, idFoto, estado: 'sen-datos' };
  const datos = await obxecto.json();
  return { ok: true, ...datos };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, {
      ok: false,
      erro: 'O editor non está configurado correctamente.'
    });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try {
    usuario = await verificarTokenFirebase(
      String(datos.idToken || ''),
      env.FIREBASE_API_KEY
    );
  } catch (erro) {
    console.error('Erro Firebase editor:', erro);
  }

  if (!usuario) {
    return json(401, {
      ok: false,
      erro: 'A identificación non é válida ou caducou'
    });
  }

  try {
    await comprobarAdministracion(env, usuario);

    const accion = String(datos.accion || '').trim();
    const idFoto = String(datos.idFoto || datos.rowId || '').trim();

    if (accion === 'obterOriginal') {
      const resultado = await obterOriginalR2(env, idFoto);
      return json(resultado.ok ? 200 : 409, resultado);
    }
    if (accion === 'gardarEdicion') {
      return json(200, await gardarEdicion(env, usuario, datos, context));
    }
    if (accion === 'estadoSincronizacion') {
      return json(200, await obterEstado(env, idFoto));
    }

    return json(400, { ok: false, erro: 'Acción non permitida' });
  } catch (erro) {
    console.error('Erro no editor de fotografías:', erro);
    const status =
      erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT'
        ? 504
        : 503;
    return json(status, {
      ok: false,
      erro: erro instanceof Error
        ? erro.message
        : 'O editor non está dispoñible neste momento.'
    });
  }
}
