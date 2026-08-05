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

function extension(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
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

    const indiceRuta = `fotos/traballo/${idFoto}.json`;
    const indiceAnteriorObj = await env.R2_PRIVADO.get(indiceRuta);
    const indiceAnterior = indiceAnteriorObj ? await indiceAnteriorObj.json().catch(() => ({})) : {};
    const rutaAnterior = texto(indiceAnterior?.ruta);
    const rutaOrixinal = texto(indiceAnterior?.rutaOrixinal || rutaAnterior);
    const marca = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rutaEditada = `fotos/editadas/${idFoto}-${marca}.${extension(mimeType)}`;

    await env.R2_PRIVADO.put(rutaEditada, bytes, {
      httpMetadata: { contentType: mimeType, cacheControl: 'private, max-age=31536000, immutable' },
      customMetadata: { idFoto, tipo: 'borrador-edicion', editadaPor: usuario.email, editadaEn: new Date().toISOString() }
    });

    await env.R2_PRIVADO.put(indiceRuta, JSON.stringify({
      ...indiceAnterior,
      idFoto,
      ruta: rutaEditada,
      rutaOrixinal,
      mimeType,
      estado: 'Pendente',
      publicarPublica: false,
      publicarPrivada: false,
      actualizadoEn: new Date().toISOString()
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' }
    });

    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'actualizarRevisionFoto',
      email: usuario.email,
      uidFirebase: usuario.uid,
      rowId: idFoto,
      idFoto,
      estado: 'Pendente',
      publicarPublica: false,
      publicarPrivada: false,
      destacadaPublica: false,
      destacadaPrivada: false,
      titulo: texto(datos.titulo),
      peFoto: texto(datos.peFoto),
      observacions: texto(datos.observacions)
    }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });

    if (!resultado?.ok) {
      if (indiceAnteriorObj) {
        await env.R2_PRIVADO.put(indiceRuta, JSON.stringify(indiceAnterior), {
          httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' }
        });
      }
      throw new Error(resultado?.erro || 'Non se puido manter a fotografía como pendente.');
    }

    await Promise.allSettled([
      env.R2_PRIVADO.delete('cache/fotos/listar-revision.json'),
      env.R2_PRIVADO.delete('indices/catalogo-fotos.json'),
      env.R2_PRIVADO.put(`fotos/estado-edicion/${idFoto}.json`, JSON.stringify({
        idFoto,
        estado: 'sincronizada',
        tipo: 'borrador',
        rutaPrivada: rutaEditada,
        actualizadoEn: new Date().toISOString()
      }), {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' }
      })
    ]);

    return json(200, {
      ok: true,
      idFoto,
      estado: 'Pendente',
      rutaPrivada: rutaEditada,
      mensaxe: 'Borrador gardado. A fotografía conserva a edición e continúa pendente de revisión.'
    });
  } catch (erro) {
    console.error('Erro ao gardar borrador fotográfico:', erro);
    return json(503, { ok: false, erro: erro instanceof Error ? erro.message : 'Non se puido gardar o borrador.' });
  }
}
