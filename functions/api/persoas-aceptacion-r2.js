import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const ACCEPTANCE_PREFIX = 'persoas/aceptacions/';

const clean = (value) => String(value || '').trim();
const safeId = (value) => clean(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
const keyIndex = (idPersoa) => `${ACCEPTANCE_PREFIX}${safeId(idPersoa)}/latest.json`;
const prefixPersoa = (idPersoa) => `${ACCEPTANCE_PREFIX}${safeId(idPersoa)}/`;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}

async function verificarAcceso(env, data) {
  const user = await verificarFirebase(data?.idToken, env.FIREBASE_API_KEY);
  if (!user) throw Object.assign(new Error('A sesión administrativa non é válida.'), { status: 401 });
  let permiso = await obterPermisoPortalCacheado(env, user, 'persoas');
  if (!permiso) permiso = await obterPermisoPortal(env, user, 'persoas');
  if (!permiso?.podeLer) throw Object.assign(new Error('Non tes permiso de lectura no módulo Persoas.'), { status: 403 });
  return user;
}

function metaDesdeObxecto(idPersoa, object) {
  const documento = clean(object?.key);
  const nome = documento.split('/').pop() || 'aceptacion.pdf';
  const revisionId = nome.replace(/^aceptacion-/, '').replace(/\.pdf$/i, '');
  return {
    idPersoa,
    revisionId,
    documento,
    completadaEn: object?.uploaded instanceof Date ? object.uploaded.toISOString() : clean(object?.uploaded),
    versionLegal: clean(object?.customMetadata?.versionLegal),
    nomeFicheiro: nome
  };
}

async function localizarAceptacion(env, idPersoa) {
  if (!env.R2_PRIVADO?.get) return null;
  const indexObject = await env.R2_PRIVADO.get(keyIndex(idPersoa));
  if (indexObject) {
    const meta = await indexObject.json().catch(() => null);
    const documento = clean(meta?.documento);
    if (documento.startsWith(prefixPersoa(idPersoa)) && documento.toLowerCase().endsWith('.pdf')) {
      const pdf = await env.R2_PRIVADO.get(documento);
      if (pdf) return { meta, pdf, reparada: false };
    }
  }

  if (!env.R2_PRIVADO?.list) return null;
  const listado = await env.R2_PRIVADO.list({ prefix: prefixPersoa(idPersoa), limit: 1000 });
  const candidatos = (listado?.objects || [])
    .filter((object) => clean(object?.key).toLowerCase().endsWith('.pdf'))
    .sort((a, b) => new Date(b?.uploaded || 0).getTime() - new Date(a?.uploaded || 0).getTime());
  if (!candidatos.length) return null;

  const candidato = candidatos[0];
  const pdf = await env.R2_PRIVADO.get(candidato.key);
  if (!pdf) return null;
  const meta = metaDesdeObxecto(idPersoa, { ...candidato, customMetadata: pdf.customMetadata || candidato.customMetadata });

  if (env.R2_PRIVADO?.put) {
    await env.R2_PRIVADO.put(keyIndex(idPersoa), JSON.stringify(meta), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
      customMetadata: { tipo: 'aceptacion-index-reparado', version: '1' }
    }).catch((error) => console.warn('Non se puido reparar o índice da aceptación:', error));
  }

  return { meta, pdf, reparada: true };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida.' }); }

  try { await verificarAcceso(env, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible comprobar o acceso.' }); }

  const accion = clean(data?.accion);
  if (!['estadoAceptacion', 'obterAceptacion'].includes(accion)) return json(400, { ok: false, erro: 'Acción non permitida.' });
  const idPersoa = safeId(data?.idPersoa);
  if (!idPersoa) return json(400, { ok: false, erro: 'Falta a persoa.' });

  const aceptacion = await localizarAceptacion(env, idPersoa);
  if (accion === 'estadoAceptacion') {
    return json(200, {
      ok: true,
      disponible: Boolean(aceptacion),
      aceptacion: aceptacion?.meta || null,
      indiceReparado: aceptacion?.reparada === true
    });
  }
  if (!aceptacion) return json(404, { ok: false, erro: 'Esta persoa aínda non ten unha aceptación electrónica dispoñible en R2.' });

  const headers = new Headers();
  aceptacion.pdf.writeHttpMetadata?.(headers);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Disposition', `inline; filename="${clean(aceptacion.meta?.nomeFicheiro || 'aceptacion.pdf').replace(/["\\]/g, '')}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(aceptacion.pdf.body, { status: 200, headers });
}
