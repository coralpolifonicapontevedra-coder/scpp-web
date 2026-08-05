import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const CACHE_LISTA_REVISION = 'cache/fotos/listar-revision.json';
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

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

async function claveCorreo(email) {
  const datos = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((valor) => valor.toString(16).padStart(2, '0')).join('');
}

async function administracionCacheada(env, usuario) {
  const clave = await claveCorreo(usuario.email);
  const obxecto = await env.R2_PRIVADO.get(`cache/autorizacion-fotos/${clave}.json`);
  if (!obxecto) return false;
  const datos = await obxecto.json().catch(() => null);
  const verificadaEn = Date.parse(String(datos?.verificadaEn || ''));
  return datos?.administrador === true && Number.isFinite(verificadaEn) &&
    Date.now() - verificadaEn < AUTH_TTL_MS;
}

async function comprobarAdministracion(env, usuario) {
  if (await administracionCacheada(env, usuario)) return;
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Administración non autorizada');
}

const idFoto = (foto) => String(
  foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID'] || ''
).trim();

async function lerIndice(bucket, clave) {
  const obxecto = await bucket.get(clave);
  if (!obxecto) return { ok: true, fotos: [], total: 0, version: '1' };
  const indice = await obxecto.json().catch(() => null);
  if (!indice || !Array.isArray(indice.fotos)) throw new Error(`O índice ${clave} non é válido.`);
  return indice;
}

function prepararIndice(indice, fotos, operacionId) {
  const agora = new Date();
  return {
    ...indice,
    ok: true,
    fotos,
    total: fotos.length,
    xeradoEn: agora.toISOString(),
    xeradoEnMs: agora.getTime(),
    actualizadoDesde: 'XESTION-FOTOS',
    operacionId
  };
}

async function gardarIndice(bucket, clave, indice, publico) {
  await bucket.put(clave, JSON.stringify(indice), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: publico
        ? 'public, max-age=0, no-cache, must-revalidate'
        : 'private, max-age=0, no-cache, must-revalidate'
    }
  });
}

async function sincronizarSheet(env, usuario, id, publicarPublica, publicarPrivada) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'actualizarPublicacionFoto',
    email: usuario.email,
    uidFirebase: usuario.uid,
    rowId: id,
    idFoto: id,
    publicarPublica,
    publicarPrivada,
    destacadaPublica: false,
    destacadaPrivada: false
  }, { timeoutMs: 60_000, attemptTimeoutMs: 20_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Non se puido actualizar a folla Fotos.');
  return resultado;
}

function presente(indice, id) {
  return (indice.fotos || []).some((foto) => idFoto(foto) === id);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PUBLICO || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const usuario = await verificarTokenFirebase(String(datos.idToken || ''), env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  const id = String(datos.idFoto || '').trim();
  const ambito = String(datos.ambito || '').trim().toLowerCase();
  if (!id || !['publica', 'privada', 'ambas'].includes(ambito)) {
    return json(400, { ok: false, erro: 'Falta a fotografía ou o ámbito da retirada.' });
  }

  try {
    await comprobarAdministracion(env, usuario);

    const [indicePublicoAnterior, indicePrivadoAnterior] = await Promise.all([
      lerIndice(env.R2_PUBLICO, INDEX_PUBLICO),
      lerIndice(env.R2_PRIVADO, INDEX_PRIVADO)
    ]);

    const estabaPublica = presente(indicePublicoAnterior, id);
    const estabaPrivada = presente(indicePrivadoAnterior, id);
    const retirarPublica = ambito === 'publica' || ambito === 'ambas';
    const retirarPrivada = ambito === 'privada' || ambito === 'ambas';
    const publicarPublica = estabaPublica && !retirarPublica;
    const publicarPrivada = estabaPrivada && !retirarPrivada;
    const operacionId = crypto.randomUUID();

    const indicePublicoNovo = prepararIndice(
      indicePublicoAnterior,
      retirarPublica
        ? indicePublicoAnterior.fotos.filter((foto) => idFoto(foto) !== id)
        : indicePublicoAnterior.fotos,
      operacionId
    );
    const indicePrivadoNovo = prepararIndice(
      indicePrivadoAnterior,
      retirarPrivada
        ? indicePrivadoAnterior.fotos.filter((foto) => idFoto(foto) !== id)
        : indicePrivadoAnterior.fotos,
      operacionId
    );

    const escrituras = [];
    if (retirarPublica && estabaPublica) {
      escrituras.push(gardarIndice(env.R2_PUBLICO, INDEX_PUBLICO, indicePublicoNovo, true));
    }
    if (retirarPrivada && estabaPrivada) {
      escrituras.push(gardarIndice(env.R2_PRIVADO, INDEX_PRIVADO, indicePrivadoNovo, false));
    }
    await Promise.all(escrituras);

    try {
      await sincronizarSheet(env, usuario, id, publicarPublica, publicarPrivada);
    } catch (erroSheet) {
      const restauracions = [];
      if (retirarPublica && estabaPublica) {
        restauracions.push(gardarIndice(env.R2_PUBLICO, INDEX_PUBLICO, indicePublicoAnterior, true));
      }
      if (retirarPrivada && estabaPrivada) {
        restauracions.push(gardarIndice(env.R2_PRIVADO, INDEX_PRIVADO, indicePrivadoAnterior, false));
      }
      await Promise.allSettled(restauracions);
      throw erroSheet;
    }

    await env.R2_PRIVADO.delete(CACHE_LISTA_REVISION);

    const [indicePublicoVerificado, indicePrivadoVerificado] = await Promise.all([
      lerIndice(env.R2_PUBLICO, INDEX_PUBLICO),
      lerIndice(env.R2_PRIVADO, INDEX_PRIVADO)
    ]);

    const verificacionPublica = presente(indicePublicoVerificado, id) === publicarPublica;
    const verificacionPrivada = presente(indicePrivadoVerificado, id) === publicarPrivada;
    if (!verificacionPublica || !verificacionPrivada) {
      throw new Error('A operación foi gardada, pero a verificación final dos índices non coincide. Reconstrúe os índices antes de continuar.');
    }

    return json(200, {
      ok: true,
      idFoto: id,
      operacionId,
      publicarPublica,
      publicarPrivada,
      retiradaPublica: retirarPublica && estabaPublica,
      retiradaPrivada: retirarPrivada && estabaPrivada,
      sheet: 'actualizada',
      indices: 'actualizados-e-verificados',
      cacheRevision: 'invalidada',
      mensaxe: ambito === 'ambas'
        ? 'Fotografía retirada das dúas galerías. Sheet, índices e caché quedaron actualizados e verificados.'
        : `Fotografía retirada da galería ${ambito}. Sheet, índices e caché quedaron actualizados e verificados.`
    });
  } catch (erro) {
    console.error('Erro ao retirar fotografía dunha galería:', erro);
    return json(503, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non se puido completar a retirada.'
    });
  }
}
