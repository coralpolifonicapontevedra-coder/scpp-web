import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const INDEX_KEY = 'indices/galeria-privada.json';
const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

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
  return {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
}

async function lerIndice(env) {
  if (!env.R2_PRIVADO) return null;
  const obxecto = await env.R2_PRIVADO.get(INDEX_KEY);
  if (!obxecto) return null;
  try {
    const indice = await obxecto.json();
    const xeradoEn = Date.parse(String(indice?.xeradoEn || ''));
    return {
      indice,
      idadeMs: Number.isFinite(xeradoEn) ? Math.max(0, Date.now() - xeradoEn) : Infinity
    };
  } catch {
    return null;
  }
}

async function crearIndice(env, usuario) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosGaleria',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });

  if (!resultado?.ok || !Array.isArray(resultado.fotos)) {
    throw new Error(resultado?.erro || 'Non se puido crear o índice da galería privada.');
  }

  const fotos = resultado.fotos
    .filter((foto) => String(foto.rutaR2Privada || foto.RutaR2_Privada || '').trim())
    .map((foto) => ({
      idFoto: String(foto.idFoto || foto.rowId || '').trim(),
      titulo: String(foto.titulo || 'Fotografía do arquivo').trim(),
      data: String(foto.data || '').trim(),
      anoAproximado: String(foto.anoAproximado || '').trim(),
      lugar: String(foto.lugar || '').trim(),
      concerto: String(foto.concerto || '').trim(),
      evento: String(foto.evento || '').trim(),
      peFoto: String(foto.peFoto || '').trim(),
      autor: String(foto.autor || '').trim(),
      procedencia: String(foto.procedencia || '').trim(),
      destacada: foto.destacada === true,
      grupo: String(foto.grupo || foto.peFoto || foto.evento || foto.concerto || 'Arquivo fotográfico').trim(),
      rutaR2Privada: String(foto.rutaR2Privada || foto.RutaR2_Privada || '').trim()
    }));

  const indice = {
    version: 1,
    xeradoEn: new Date().toISOString(),
    total: fotos.length,
    fotos
  };

  await env.R2_PRIVADO.put(INDEX_KEY, JSON.stringify(indice), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, max-age=600' }
  });
  return indice;
}

async function obterIndice(env, usuario) {
  const existente = await lerIndice(env);
  if (existente && existente.idadeMs <= FRESH_MS) {
    return { indice: existente.indice, orixe: 'R2-FRESH' };
  }

  if (existente && existente.idadeMs <= STALE_MS) {
    crearIndice(env, usuario).catch((erro) => console.error('Actualización silenciosa da galería:', erro));
    return { indice: existente.indice, orixe: 'R2-STALE' };
  }

  try {
    return { indice: await crearIndice(env, usuario), orixe: 'APPS-SCRIPT' };
  } catch (erro) {
    if (existente?.indice) return { indice: existente.indice, orixe: 'R2-RESCUE' };
    throw erro;
  }
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
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'A galería privada non está configurada correctamente.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  let usuario;
  try { usuario = await verificarTokenFirebase(String(datos.idToken || ''), env.FIREBASE_API_KEY); }
  catch (erro) { console.error('Erro Firebase galería privada:', erro); }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || 'listar').trim();
  try {
    const { indice, orixe } = await obterIndice(env, usuario);

    if (accion === 'listar') {
      const fotos = (indice.fotos || []).map(({ rutaR2Privada, ...foto }) => foto);
      return json(200, { ok: true, xeradoEn: indice.xeradoEn, total: fotos.length, fotos }, {
        'Cache-Control': 'private, max-age=60',
        'X-SCPP-Galeria-Orige': orixe
      });
    }

    if (accion === 'imaxe') {
      const idFoto = String(datos.idFoto || '').trim();
      const foto = (indice.fotos || []).find((item) => String(item.idFoto) === idFoto);
      if (!foto?.rutaR2Privada) return json(404, { ok: false, erro: 'Non se atopou a fotografía privada' });
      const obxecto = await env.R2_PRIVADO.get(foto.rutaR2Privada);
      if (!obxecto) return json(404, { ok: false, erro: 'O ficheiro da fotografía non existe en R2' });
      return respostaImaxe(obxecto);
    }

    if (accion === 'refrescar') {
      const novo = await crearIndice(env, usuario);
      return json(200, { ok: true, total: novo.total, xeradoEn: novo.xeradoEn });
    }

    return json(400, { ok: false, erro: 'Acción non permitida' });
  } catch (erro) {
    console.error('Erro na galería privada:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, { ok: false, erro: erro instanceof Error ? erro.message : 'A galería privada non está dispoñible.' });
  }
}
