import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8000;
const MAX_REVISION_OBJECTS = 2000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: String(user.localId || ''), email: String(user.email).trim().toLowerCase() };
}

async function comprobarAdmin(env, user) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarPersoasAdministracion',
    email: user.email,
    uidFirebase: user.uid
  }, { timeoutMs: 20000, attemptTimeoutMs: 10000 });
  return resultado?.ok === true && resultado?.perfil?.nivel === 'Administración';
}

function safeId(value) {
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
}

function safeFichaKey(value) {
  const key = String(value || '').trim().replace(/^\/+/, '');
  if (!key || key.includes('..') || key.includes('\\')) return '';
  return key.startsWith('persoas/fichas/') ? key : '';
}

async function listarPrefix(bucket, prefix, limite = 1000) {
  const keys = [];
  let cursor;
  do {
    const result = await bucket.list({ prefix, cursor, limit: Math.min(1000, limite - keys.length) });
    for (const object of result.objects || []) {
      keys.push(object.key);
      if (keys.length >= limite) break;
    }
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor && keys.length < limite);
  return keys;
}

async function eliminarKeys(bucket, keys) {
  const unicas = [...new Set(keys.filter(Boolean))];
  for (const key of unicas) await bucket.delete(key);
  return unicas.length;
}

async function revisionsDaPersoa(bucket, idPersoa, rowId) {
  const keys = await listarPrefix(bucket, 'persoas/revisions/', MAX_REVISION_OBJECTS);
  const borrar = [];
  for (const key of keys) {
    const object = await bucket.get(key);
    if (!object) continue;
    try {
      const revision = await object.json();
      const ref = String(revision?.idPersoa || '').trim();
      const snap = revision?.persoa || {};
      const snapRef = String(snap.idPersoa || snap.id || snap.rowId || '').trim();
      if ((idPersoa && (ref === idPersoa || snapRef === idPersoa)) || (rowId && (ref === rowId || snapRef === rowId))) {
        borrar.push(key);
      }
    } catch {
      // Un obxecto alleo ou antigo non debe impedir a limpeza dunha alta errónea.
    }
  }
  return borrar;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.delete !== 'function') {
    return json(503, { ok: false, erro: 'R2 privado non está dispoñible.' });
  }

  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Petición non válida.' }); }

  const user = await verificarFirebase(data?.idToken, env.FIREBASE_API_KEY);
  if (!user) return json(401, { ok: false, erro: 'Sesión non válida.' });
  if (!env.WEB_WRITE_TOKEN) return json(500, { ok: false, erro: 'Falta a configuración de Apps Script.' });

  try {
    if (!(await comprobarAdmin(env, user))) return json(403, { ok: false, erro: 'Non tes permiso de Administración.' });
  } catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible comprobar os permisos.' });
  }

  const idPersoa = String(data?.idPersoa || '').trim();
  const rowId = String(data?.rowId || '').trim();
  const id = safeId(idPersoa || rowId);
  if (!id) return json(400, { ok: false, erro: 'Falta o identificador da persoa.' });

  try {
    const keys = [];
    const ficha = safeFichaKey(data?.fichaR2Key);
    if (ficha) keys.push(ficha);

    keys.push(...await listarPrefix(env.R2_PRIVADO, `persoas/fotos/${id}/`, 100));
    keys.push(...await listarPrefix(env.R2_PRIVADO, `persoas/aceptacions/${id}/`, 100));
    keys.push(...await revisionsDaPersoa(env.R2_PRIVADO, idPersoa, rowId));

    const eliminados = await eliminarKeys(env.R2_PRIVADO, keys);
    return json(200, {
      ok: true,
      eliminadosR2: eliminados,
      idPersoa,
      rowId,
      entorno: 'PREVIEW'
    });
  } catch (error) {
    return json(500, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non foi posible completar a limpeza de R2.'
    });
  }
}
