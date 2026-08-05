import { obterJsonAppsScript } from '../_lib/apps-script.js';

const MAX_BYTES = 12 * 1024 * 1024;
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUTH_TTL_MS = 15 * 60 * 1000;

const texto = (v) => String(v ?? '').trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

async function verificarToken(idToken, apiKey) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
  });
  if (!r.ok) return null;
  const u = (await r.json())?.users?.[0];
  return u?.email && u.emailVerified === true
    ? { uid: texto(u.localId), email: texto(u.email).toLowerCase() }
    : null;
}

async function claveCorreo(email) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto(email).toLowerCase()));
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}

async function comprobarAdmin(env, usuario) {
  const ruta = `cache/autorizacion-fotos/${await claveCorreo(usuario.email)}.json`;
  const obxecto = await env.R2_PRIVADO.get(ruta);
  if (obxecto) {
    const datos = await obxecto.json().catch(() => null);
    const verificadaEn = Date.parse(texto(datos?.verificadaEn));
    if (datos?.administrador === true && Number.isFinite(verificadaEn) && Date.now() - verificadaEn < AUTH_TTL_MS) return;
  }
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarFotosRevision',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Administración non autorizada');
}

function decodificar(base64) {
  const bin = atob(texto(base64));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const usuario = await verificarToken(texto(datos.idToken), env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  try {
    await comprobarAdmin(env, usuario);
    const idFoto = texto(datos.idFoto || datos.rowId);
    const mimeType = texto(datos.mimeType).toLowerCase();
    if (!idFoto || !TIPOS.has(mimeType) || !texto(datos.base64)) throw new Error('Faltan datos da edición.');

    const bytes = decodificar(datos.base64);
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error('A edición supera o máximo de 12 MB.');

    const actualizadoEn = new Date().toISOString();
    const rutaCanonica = `fotos/borradores/${idFoto}`;
    const indiceRuta = `fotos/traballo/${idFoto}.json`;
    const indiceAnteriorObj = await env.R2_PRIVADO.get(indiceRuta);
    const indiceAnterior = indiceAnteriorObj ? await indiceAnteriorObj.json().catch(() => ({})) : {};
    const rutaAnterior = texto(indiceAnterior?.ruta);
    const rutaOrixinal = texto(indiceAnterior?.rutaOrixinal || rutaAnterior);

    await env.R2_PRIVADO.put(rutaCanonica, bytes, {
      httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store, max-age=0' },
      customMetadata: {
        idFoto,
        tipo: 'borrador-canonico',
        editadaPor: usuario.email,
        editadaEn: actualizadoEn
      }
    });

    await Promise.all([
      env.R2_PRIVADO.put(indiceRuta, JSON.stringify({
        ...indiceAnterior,
        idFoto,
        ruta: rutaCanonica,
        rutaBorrador: rutaCanonica,
        rutaOrixinal,
        mimeType,
        estado: 'Pendente',
        publicarPublica: false,
        publicarPrivada: false,
        tituloBorrador: texto(datos.titulo),
        peFotoBorrador: texto(datos.peFoto),
        observacionsBorrador: texto(datos.observacions),
        actualizadoEn
      }), {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' }
      }),
      env.R2_PRIVADO.put(`fotos/estado-edicion/${idFoto}.json`, JSON.stringify({
        idFoto,
        estado: 'sincronizada',
        tipo: 'borrador',
        rutaPrivada: rutaCanonica,
        mimeType,
        sheet: 'sen-cambios',
        actualizadoEn
      }), {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' }
      })
    ]);

    const comprobacion = await env.R2_PRIVADO.get(rutaCanonica);
    if (!comprobacion || comprobacion.size !== bytes.byteLength) {
      throw new Error('O borrador non superou a verificación final en R2.');
    }

    return json(200, {
      ok: true,
      idFoto,
      estado: 'Pendente',
      rutaPrivada: rutaCanonica,
      bytes: bytes.byteLength,
      sheet: 'sen-cambios',
      mensaxe: 'Borrador gardado e verificado en R2. A fotografía continúa pendente de revisión.'
    });
  } catch (erro) {
    console.error('Erro ao gardar borrador fotográfico:', erro);
    return json(503, { ok: false, erro: erro instanceof Error ? erro.message : 'Non se puido gardar o borrador.' });
  }
}
