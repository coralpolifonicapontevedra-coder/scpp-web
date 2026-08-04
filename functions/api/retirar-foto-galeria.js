import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
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

const idFoto = (foto) => String(foto?.idFoto || foto?.Id_Foto || foto?.rowId || '').trim();

async function lerIndice(bucket, clave) {
  const obxecto = await bucket.get(clave);
  if (!obxecto) return { ok: true, fotos: [], total: 0, version: '1' };
  const indice = await obxecto.json().catch(() => null);
  if (!indice || !Array.isArray(indice.fotos)) throw new Error(`O índice ${clave} non é válido.`);
  return indice;
}

async function gardarIndice(bucket, clave, indice) {
  const agora = new Date();
  await bucket.put(clave, JSON.stringify({
    ...indice,
    ok: true,
    total: indice.fotos.length,
    xeradoEn: agora.toISOString(),
    xeradoEnMs: agora.getTime(),
    actualizadoDesde: 'XESTION-FOTOS'
  }), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-cache, max-age=0'
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
  }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Non se puido actualizar a folla Fotos.');
}

export async function onRequest(context) {
  const { request, env } = context;
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

    const [indicePublico, indicePrivado] = await Promise.all([
      lerIndice(env.R2_PUBLICO, INDEX_PUBLICO),
      lerIndice(env.R2_PRIVADO, INDEX_PRIVADO)
    ]);

    const estabaPublica = indicePublico.fotos.some((foto) => idFoto(foto) === id);
    const estabaPrivada = indicePrivado.fotos.some((foto) => idFoto(foto) === id);
    const retirarPublica = ambito === 'publica' || ambito === 'ambas';
    const retirarPrivada = ambito === 'privada' || ambito === 'ambas';
    const publicarPublica = estabaPublica && !retirarPublica;
    const publicarPrivada = estabaPrivada && !retirarPrivada;

    const gardados = [];
    if (retirarPublica && estabaPublica) {
      indicePublico.fotos = indicePublico.fotos.filter((foto) => idFoto(foto) !== id);
      gardados.push(gardarIndice(env.R2_PUBLICO, INDEX_PUBLICO, indicePublico));
    }
    if (retirarPrivada && estabaPrivada) {
      indicePrivado.fotos = indicePrivado.fotos.filter((foto) => idFoto(foto) !== id);
      gardados.push(gardarIndice(env.R2_PRIVADO, INDEX_PRIVADO, indicePrivado));
    }
    await Promise.all(gardados);

    const sincronizacion = sincronizarSheet(env, usuario, id, publicarPublica, publicarPrivada)
      .catch((erro) => console.error('A retirada quedou en R2, pero fallou a sincronización da Sheet:', erro));
    if (context.waitUntil) context.waitUntil(sincronizacion);

    return json(200, {
      ok: true,
      idFoto: id,
      publicarPublica,
      publicarPrivada,
      retiradaPublica: retirarPublica && estabaPublica,
      retiradaPrivada: retirarPrivada && estabaPrivada,
      sheet: 'sincronizando',
      mensaxe: ambito === 'ambas'
        ? 'Fotografía retirada das dúas galerías. A Sheet está sincronizando.'
        : `Fotografía retirada da galería ${ambito}. A Sheet está sincronizando.`
    });
  } catch (erro) {
    console.error('Erro ao retirar fotografía dunha galería:', erro);
    return json(503, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non se puido completar a retirada.'
    });
  }
}
