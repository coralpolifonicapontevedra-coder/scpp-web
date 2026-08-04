import { obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const CACHE_LISTA_REVISION = 'cache/fotos/listar-revision.json';
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

const texto = (valor) => String(valor || '').trim();
const verdadeiro = (valor) => valor === true || ['true', '1', 'yes', 'si', 'sí'].includes(texto(valor).toLowerCase());
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
  return { uid: texto(usuario.localId), email: texto(usuario.email).toLowerCase() };
}

async function claveCorreo(email) {
  const bytes = new TextEncoder().encode(texto(email).toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

async function administracionCacheada(env, usuario) {
  const clave = await claveCorreo(usuario.email);
  const obxecto = await env.R2_PRIVADO.get(`cache/autorizacion-fotos/${clave}.json`);
  if (!obxecto) return false;
  const datos = await obxecto.json().catch(() => null);
  const verificadaEn = Date.parse(texto(datos?.verificadaEn));
  return datos?.administrador === true && Number.isFinite(verificadaEn) && Date.now() - verificadaEn < AUTH_TTL_MS;
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

function idFoto(foto) {
  const directo = texto(foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID']);
  if (directo) return directo;
  const uuid = JSON.stringify(foto || {}).match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return uuid?.[0] || '';
}

async function lerIndice(bucket, clave) {
  const obxecto = await bucket.get(clave);
  if (!obxecto) return { ok: true, fotos: [], total: 0, version: '3' };
  const indice = await obxecto.json().catch(() => null);
  if (!indice || !Array.isArray(indice.fotos)) throw new Error(`O índice ${clave} non é válido.`);
  return indice;
}

async function listarSheet(env, usuario, tipo) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosPublicadas',
    email: usuario.email,
    uidFirebase: usuario.uid,
    tipo
  }, { timeoutMs: 90_000, attemptTimeoutMs: 30_000 });
  if (!resultado?.ok || !Array.isArray(resultado.fotos)) {
    throw new Error(resultado?.erro || `Non se puideron ler as fotografías ${tipo}s da Sheet.`);
  }
  return resultado.fotos;
}

function normalizarSheet(foto, tipo) {
  const id = idFoto(foto);
  const rutaPublica = texto(foto?.rutaR2Publica || foto?.rutaR2_Publica || foto?.RutaR2_Publica || foto?.rutaR2 || foto?.RutaR2);
  const rutaPrivada = texto(foto?.rutaR2Privada || foto?.rutaR2_Privada || foto?.RutaR2_Privada || foto?.rutaR2 || foto?.RutaR2);
  return {
    ...foto,
    idFoto: id,
    titulo: texto(foto?.titulo || foto?.Titulo),
    peFoto: texto(foto?.peFoto || foto?.PeFoto),
    observacions: texto(foto?.observacions || foto?.Observacions),
    rutaR2Publica: tipo === 'publica' ? rutaPublica : '',
    rutaR2Privada: tipo === 'privada' ? rutaPrivada : '',
    publicarPublica: tipo === 'publica',
    publicarPrivada: tipo === 'privada',
    destacada: verdadeiro(foto?.destacada || foto?.Destacada || foto?.destacadaPublica || foto?.destacadaPrivada)
  };
}

function mapaIndice(indice) {
  const mapa = new Map();
  for (const foto of indice.fotos || []) {
    const id = idFoto(foto);
    if (id) mapa.set(id, foto);
  }
  return mapa;
}

function reconstruir(listaSheet, indiceAnterior, tipo) {
  const anteriores = mapaIndice(indiceAnterior);
  const fotos = [];
  const senId = [];
  const senRuta = [];

  for (const raw of listaSheet) {
    const foto = normalizarSheet(raw, tipo);
    if (!foto.idFoto) {
      senId.push(texto(foto.titulo || foto.peFoto || 'Fotografía sen identificar'));
      continue;
    }
    const anterior = anteriores.get(foto.idFoto) || {};
    const ruta = tipo === 'publica'
      ? texto(foto.rutaR2Publica || anterior.rutaR2Publica || anterior.rutaR2)
      : texto(foto.rutaR2Privada || anterior.rutaR2Privada || anterior.rutaR2);
    if (!ruta) {
      senRuta.push(foto.idFoto);
      continue;
    }
    fotos.push({
      ...anterior,
      ...foto,
      idFoto: foto.idFoto,
      ...(tipo === 'publica' ? { rutaR2Publica: ruta } : { rutaR2Privada: ruta })
    });
  }

  const agora = new Date();
  return {
    indice: {
      ...indiceAnterior,
      ok: true,
      fotos,
      total: fotos.length,
      xeradoEn: agora.toISOString(),
      xeradoEnMs: agora.getTime(),
      orixe: 'RECONSTRUCCION_SHEET_R2',
      version: '3'
    },
    senId,
    senRuta
  };
}

async function gardarIndice(bucket, clave, indice, publico) {
  await bucket.put(clave, JSON.stringify(indice), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: publico ? 'public, max-age=0, must-revalidate' : 'private, max-age=0, must-revalidate'
    }
  });
}

function compararIds(sheet, indice) {
  const idsSheet = new Set(sheet.map(idFoto).filter(Boolean));
  const idsIndice = new Set((indice.fotos || []).map(idFoto).filter(Boolean));
  return {
    faltantes: [...idsSheet].filter((id) => !idsIndice.has(id)),
    sobrantes: [...idsIndice].filter((id) => !idsSheet.has(id))
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PUBLICO || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const usuario = await verificarTokenFirebase(texto(datos.idToken), env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  try {
    await comprobarAdministracion(env, usuario);
    const inicio = Date.now();
    const [sheetPublica, sheetPrivada, anteriorPublico, anteriorPrivado] = await Promise.all([
      listarSheet(env, usuario, 'publica'),
      listarSheet(env, usuario, 'privada'),
      lerIndice(env.R2_PUBLICO, INDEX_PUBLICO),
      lerIndice(env.R2_PRIVADO, INDEX_PRIVADO)
    ]);

    const publico = reconstruir(sheetPublica, anteriorPublico, 'publica');
    const privado = reconstruir(sheetPrivada, anteriorPrivado, 'privada');

    await Promise.all([
      gardarIndice(env.R2_PUBLICO, INDEX_PUBLICO, publico.indice, true),
      gardarIndice(env.R2_PRIVADO, INDEX_PRIVADO, privado.indice, false),
      env.R2_PRIVADO.delete(CACHE_LISTA_REVISION)
    ]);

    const [verificadoPublico, verificadoPrivado] = await Promise.all([
      lerIndice(env.R2_PUBLICO, INDEX_PUBLICO),
      lerIndice(env.R2_PRIVADO, INDEX_PRIVADO)
    ]);
    const auditoriaPublica = compararIds(sheetPublica, verificadoPublico);
    const auditoriaPrivada = compararIds(sheetPrivada, verificadoPrivado);
    const coherente = !auditoriaPublica.faltantes.length && !auditoriaPublica.sobrantes.length &&
      !auditoriaPrivada.faltantes.length && !auditoriaPrivada.sobrantes.length;

    return json(200, {
      ok: true,
      coherente,
      publica: {
        sheet: sheetPublica.length,
        indice: verificadoPublico.fotos.length,
        faltantes: auditoriaPublica.faltantes,
        sobrantes: auditoriaPublica.sobrantes,
        senId: publico.senId,
        senRuta: publico.senRuta
      },
      privada: {
        sheet: sheetPrivada.length,
        indice: verificadoPrivado.fotos.length,
        faltantes: auditoriaPrivada.faltantes,
        sobrantes: auditoriaPrivada.sobrantes,
        senId: privado.senId,
        senRuta: privado.senRuta
      },
      cacheRevisionInvalidada: true,
      duracionMs: Date.now() - inicio,
      mensaxe: coherente
        ? 'Índices reconstruídos e verificados sen diferenzas.'
        : 'Índices reconstruídos, pero a auditoría detectou diferenzas.'
    });
  } catch (erro) {
    console.error('Erro ao reconstruír índices fotográficos:', erro);
    return json(503, { ok: false, erro: erro instanceof Error ? erro.message : 'Non se puideron reconstruír os índices.' });
  }
}
