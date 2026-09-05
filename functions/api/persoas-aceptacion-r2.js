import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const ACCEPTANCE_PREFIX = 'persoas/aceptacions/';
const REVISION_PREFIX = 'persoas/revisions/';

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
  return { user, permiso };
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

async function diagnosticarRevision(env, idPersoa, revisionId) {
  if (!env.R2_PRIVADO?.list || !env.R2_PRIVADO?.get) return { atopada: false, erro: 'R2 privado non permite listar revisións.' };
  let cursor;
  let revisadas = 0;
  do {
    const listado = await env.R2_PRIVADO.list({ prefix: REVISION_PREFIX, limit: 1000, cursor });
    const objects = Array.isArray(listado?.objects) ? listado.objects : [];
    for (const object of objects) {
      revisadas += 1;
      const stored = await env.R2_PRIVADO.get(object.key);
      if (!stored) continue;
      const revision = await stored.json().catch(() => null);
      if (!revision || typeof revision !== 'object') continue;
      const samePerson = idPersoa && safeId(revision.idPersoa) === idPersoa;
      const sameRevision = revisionId && clean(revision.revisionId) === revisionId;
      if ((revisionId && sameRevision) || (!revisionId && samePerson)) {
        return {
          atopada: true,
          revisadas,
          key: clean(object.key),
          idPersoa: clean(revision.idPersoa),
          revisionId: clean(revision.revisionId),
          estado: clean(revision.estado),
          completadaEn: clean(revision.completadaEn),
          versionLegal: clean(revision.textoLegal?.version || revision.aceptacion?.versionLegal),
          tenPersoaConfirmada: Boolean(revision.persoaConfirmada && typeof revision.persoaConfirmada === 'object'),
          documento: clean(revision.aceptacion?.documento),
          aceptacionRowId: clean(revision.aceptacion?.aceptacionRowId)
        };
      }
    }
    cursor = listado?.truncated ? clean(listado?.cursor) : '';
  } while (cursor && revisadas < 10000);
  return { atopada: false, revisadas };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida.' }); }

  let acceso;
  try { acceso = await verificarAcceso(env, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible comprobar o acceso.' }); }

  const accion = clean(data?.accion);
  if (!['estadoAceptacion', 'obterAceptacion', 'diagnosticarRevision'].includes(accion)) return json(400, { ok: false, erro: 'Acción non permitida.' });
  const idPersoa = safeId(data?.idPersoa);
  if (!idPersoa) return json(400, { ok: false, erro: 'Falta a persoa.' });

  if (accion === 'diagnosticarRevision') {
    if (acceso?.permiso?.podeAdministrar !== true) return json(403, { ok: false, erro: 'Só Administración pode executar este diagnóstico.' });
    const revisionId = clean(data?.revisionId);
    const diagnostico = await diagnosticarRevision(env, idPersoa, revisionId);
    return json(200, { ok: true, diagnostico });
  }

  const aceptacion = await localizarAceptacion(env, idPersoa);
  if (accion === 'estadoAceptacion') {
    return json(200, {
      ok: true,
      disponible: Boolean(aceptacion),
      aceptacion: aceptacion?.meta || null,
      indiceReparado: aceptacion?.reparada === true
    });
  }
  if (!aceptacion) {
    const diagnostico = acceso?.permiso?.podeAdministrar === true
      ? await diagnosticarRevision(env, idPersoa, '')
      : { atopada: false };
    if (diagnostico?.atopada) {
      return json(404, {
        ok: false,
        erro: `O PDF non está en R2, pero atopouse a revisión ${diagnostico.revisionId} en estado ${diagnostico.estado || 'descoñecido'}${diagnostico.tenPersoaConfirmada ? ' con datos confirmados conservados' : ''}.`,
        diagnostico
      });
    }
    return json(404, { ok: false, erro: 'Esta persoa aínda non ten unha aceptación electrónica dispoñible en R2 e non se atopou unha revisión recuperable.' });
  }

  const headers = new Headers();
  aceptacion.pdf.writeHttpMetadata?.(headers);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Disposition', `inline; filename="${clean(aceptacion.meta?.nomeFicheiro || 'aceptacion.pdf').replace(/["\\]/g, '')}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(aceptacion.pdf.body, { status: 200, headers });
}
