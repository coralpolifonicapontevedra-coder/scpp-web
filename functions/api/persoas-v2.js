import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';
import { obterPermisoPortal } from '../_lib/portal-permissions.js';

const MODULO = 'persoas';
const VERSION = 'persoas-v4';
const SNAPSHOT_KEY_MAIN = 'persoas/cache/snapshot-v4.json';
const SNAPSHOT_KEY_PREVIEW = 'persoas/cache/preview/snapshot-v4.json';
const PERFIS_KEY_MAIN = 'persoas/cache/perfis.json';
const PERFIS_KEY_PREVIEW = 'persoas/cache/preview/perfis.json';
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const PHOTO_INDEX_MAIN = 'persoas/fotos/index.json';
const PHOTO_INDEX_PREVIEW = 'persoas/fotos/preview/index.json';
const MAINTENANCE_KEY_MAIN = 'persoas/cache/maintenance-v1.json';
const MAINTENANCE_KEY_PREVIEW = 'persoas/cache/preview/maintenance-v1.json';
const REVISION_PREFIX = 'persoas/revisions/';
const FIREBASE_TIMEOUT_MS = 8_000;
const VERSION_TIMEOUT_MS = 5_000;
const LIST_TIMEOUT_MS = 30_000;
const MAINTENANCE_TTL_MS = 12 * 60 * 60 * 1000;

const legacyActions = new Map([
  ['listarPersoasAdministracion', 'listar'],
  ['crearPersoaAdministracion', 'crear'],
  ['actualizarPersoaAdministracion', 'actualizar'],
  ['cambiarEstadoPersoaAdministracion', 'estado'],
  ['eliminarPersoaAdministracion', 'eliminar'],
  ['obterFichaPersoaAdministracion', 'ficha']
]);

const actions = new Set(['listar', 'crear', 'actualizar', 'estado', 'eliminar', 'ficha', 'instalarSync']);

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

const clean = (value) => String(value == null ? '' : value).trim();
const envBranch = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const snapshotKey = (env) => envBranch(env) === 'main' ? SNAPSHOT_KEY_MAIN : SNAPSHOT_KEY_PREVIEW;
const perfisKey = (env) => envBranch(env) === 'main' ? PERFIS_KEY_MAIN : PERFIS_KEY_PREVIEW;
const photoIndexKey = (env) => envBranch(env) === 'main' ? PHOTO_INDEX_MAIN : PHOTO_INDEX_PREVIEW;
const maintenanceKey = (env) => envBranch(env) === 'main' ? MAINTENANCE_KEY_MAIN : MAINTENANCE_KEY_PREVIEW;

async function fetchTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetchTimeout(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    FIREBASE_TIMEOUT_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function corpoAppsScript(env, user, accion, extra = {}) {
  return {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: user?.email || '',
    actorEmail: user?.email || '',
    uidFirebase: user?.uid || '',
    ...extra
  };
}

async function chamarAppsScript(env, user, accion, extra = {}, options = {}) {
  const { resultado } = await obterJsonAppsScriptPersoas(
    env,
    corpoAppsScript(env, user, accion, extra),
    {
      timeoutMs: options.timeoutMs || LIST_TIMEOUT_MS,
      attemptTimeoutMs: options.attemptTimeoutMs || Math.min(options.timeoutMs || LIST_TIMEOUT_MS, 12_000)
    }
  );
  return resultado;
}

async function lerJsonR2(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function lerSnapshot(env) {
  const entry = await lerJsonR2(env.R2_PRIVADO, snapshotKey(env));
  if (!entry?.payload?.ok || !Array.isArray(entry.payload.persoas)) return null;
  return entry;
}

async function lerPhotoIndex(env) {
  const entry = await lerJsonR2(env.R2_PRIVADO, photoIndexKey(env));
  return entry && typeof entry === 'object' ? entry : { version: 1, persoas: {} };
}

function enriquecerFotos(payload, photoIndex) {
  if (!payload?.ok || !Array.isArray(payload.persoas)) return payload;
  const map = photoIndex?.persoas && typeof photoIndex.persoas === 'object' ? photoIndex.persoas : {};
  return {
    ...payload,
    persoas: payload.persoas.map((persoa) => {
      const ids = [persoa?.idPersoa, persoa?.id, persoa?.rowId].map(clean).filter(Boolean);
      const foto = ids.map((id) => map[id]).find(Boolean) || persoa?.fotoR2 || null;
      return { ...persoa, fotoR2: foto };
    })
  };
}

async function gardarSnapshots(env, user, permission, payload, sourceVersion = '') {
  if (!env.R2_PRIVADO?.put || !payload?.ok || !Array.isArray(payload.persoas)) return;
  const savedAt = Date.now();
  const entry = {
    version: VERSION,
    savedAt,
    sourceVersion: clean(sourceVersion || payload.sourceVersion),
    payload
  };
  const writes = [
    env.R2_PRIVADO.put(
      snapshotKey(env),
      JSON.stringify(entry),
      { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } }
    ),
    env.R2_PRIVADO.put(
      perfisKey(env),
      JSON.stringify({ savedAt, version: VERSION, persoas: payload.persoas }),
      { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } }
    )
  ];

  if (permission?.podeAdministrar && user?.email) {
    const adminPayload = {
      ...payload,
      perfil: { ...(payload.perfil || {}), email: user.email, nivel: 'Administración' }
    };
    writes.push(
      env.R2_PRIVADO.put(
        `${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`,
        JSON.stringify({ savedAt, administrador: user.email, payload: adminPayload }),
        { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } }
      )
    );
  }
  await Promise.all(writes);
}

async function consultarVersion(env, user) {
  try {
    const result = await chamarAppsScript(env, user, 'persoasV2Version', {}, {
      timeoutMs: VERSION_TIMEOUT_MS,
      attemptTimeoutMs: VERSION_TIMEOUT_MS
    });
    return result?.ok ? clean(result.version) : '';
  } catch (error) {
    console.warn('Non se puido comprobar a versión de Persoas:', error);
    return '';
  }
}

async function consultarListado(env, user, permission) {
  const result = await chamarAppsScript(env, user, 'persoasV2Listar');
  if (!result?.ok) {
    const error = new Error(result?.erro || 'Non foi posible cargar Persoas desde a Sheet.');
    error.code = result?.codigo || 'APPS_SCRIPT_RESULT';
    throw error;
  }
  const photoIndex = await lerPhotoIndex(env);
  const payload = enriquecerFotos({
    ok: true,
    version: VERSION,
    sourceVersion: clean(result.version),
    perfil: result.perfil || { email: user.email, nivel: permission?.nivel || '' },
    permiso: permission,
    schema: result.schema || { fields: [] },
    textosLegais: result.textosLegais || {},
    persoas: Array.isArray(result.persoas) ? result.persoas : []
  }, photoIndex);
  await gardarSnapshots(env, user, permission, payload, result.version);
  return payload;
}

async function listadoActual(env, user, permission, force = false) {
  const snapshot = force ? null : await lerSnapshot(env);
  if (snapshot?.payload?.persoas) {
    const photoIndex = await lerPhotoIndex(env);
    return {
      payload: enriquecerFotos({ ...snapshot.payload, permiso: permission }, photoIndex),
      fonte: 'R2',
      savedAt: Number(snapshot.savedAt || 0),
      sourceVersion: clean(snapshot.sourceVersion)
    };
  }
  return {
    payload: await consultarListado(env, user, permission),
    fonte: force ? 'SHEET-FORZADO+R2' : 'SHEET-ARRANQUE+R2',
    savedAt: Date.now(),
    sourceVersion: ''
  };
}

async function mantementoPersoas(context, user, permission, sourceVersion) {
  const { env } = context;
  if (!env.R2_PRIVADO?.get || !env.R2_PRIVADO?.put) return;
  try {
    const marker = await lerJsonR2(env.R2_PRIVADO, maintenanceKey(env));
    const checkedAt = Number(marker?.checkedAt || 0);
    if (Number.isFinite(checkedAt) && checkedAt > 0 && Date.now() - checkedAt < MAINTENANCE_TTL_MS) return;

    let currentVersion = await consultarVersion(env, user);
    let rebuilt = false;
    if (currentVersion && currentVersion !== clean(sourceVersion)) {
      await consultarListado(env, user, permission);
      rebuilt = true;
      currentVersion = clean(currentVersion);
    }

    let triggerOk = null;
    if (permission?.podeAdministrar) {
      try {
        const trigger = await chamarAppsScript(env, user, 'persoasV2InstalarTrigger', {}, {
          timeoutMs: 10_000,
          attemptTimeoutMs: 8_000
        });
        triggerOk = trigger?.ok === true;
      } catch (error) {
        console.warn('Non se puido verificar o trigger de Persoas en segundo plano:', error);
        triggerOk = false;
      }
    }

    await env.R2_PRIVADO.put(maintenanceKey(env), JSON.stringify({
      checkedAt: Date.now(),
      sourceVersion: currentVersion || clean(sourceVersion),
      rebuilt,
      triggerOk
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
    });
  } catch (error) {
    console.warn('Mantemento de Persoas en segundo plano non completado:', error);
  }
}

function normalizarAction(raw) {
  const value = clean(raw || 'listar');
  return legacyActions.get(value) || value;
}

function validarPermiso(permission, action) {
  if (!permission?.ok) return { ok: false, status: 403, erro: 'Non foi posible comprobar os permisos do módulo Persoas.' };
  if (action === 'listar' || action === 'ficha') {
    return permission.podeLer ? { ok: true } : { ok: false, status: 403, erro: 'Non tes permiso de lectura no módulo Persoas.' };
  }
  if (action === 'eliminar' || action === 'instalarSync') {
    return permission.podeAdministrar ? { ok: true } : { ok: false, status: 403, erro: 'Esta operación require nivel de administración en Persoas.' };
  }
  return permission.podeEscribir ? { ok: true } : { ok: false, status: 403, erro: 'Non tes permiso de escritura no módulo Persoas.' };
}

function claveFichaValida(value) {
  const key = clean(value).replace(/^\/+/, '');
  if (!key || key.includes('..') || key.includes('\\')) return '';
  return key.startsWith('persoas/fichas/') ? key : '';
}

function atoparPersoa(payload, referencia) {
  const ref = clean(referencia);
  if (!ref || !Array.isArray(payload?.persoas)) return null;
  return payload.persoas.find((item) => [item?.idPersoa, item?.id, item?.rowId].some((value) => clean(value) === ref)) || null;
}

async function servirFicha(env, persoa) {
  if (!env.R2_PRIVADO?.get) return json(503, { ok: false, erro: 'R2 privado non está dispoñible.' });
  const key = claveFichaValida(persoa?.fichaR2Key);
  if (!key || persoa?.fichaDisponibleR2 !== true || clean(persoa?.fichaR2Estado) !== 'SINCRONIZADO') {
    return json(404, { ok: false, erro: 'Esta persoa non ten unha ficha sincronizada en R2.' });
  }
  const object = await env.R2_PRIVADO.get(key);
  if (!object) return json(404, { ok: false, erro: 'Non se atopou a ficha en R2.' });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${(key.split('/').pop() || 'ficha.pdf').replace(/[\r\n"]/g, '')}"`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Storage', 'R2');
  headers.set('X-SCPP-Persoas-Version', VERSION);
  return new Response(object.body, { status: 200, headers });
}

async function borrarPrefix(bucket, prefix) {
  if (!bucket?.list || !bucket?.delete) return 0;
  let cursor;
  let total = 0;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = (listed.objects || []).map((item) => item.key).filter(Boolean);
    if (keys.length) {
      await bucket.delete(keys);
      total += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return total;
}

async function limparRevisionsDaPersoa(bucket, ids) {
  if (!bucket?.list || !bucket?.get || !bucket?.delete) return 0;
  const refs = new Set(ids.map(clean).filter(Boolean));
  if (!refs.size) return 0;
  let cursor;
  let total = 0;
  do {
    const listed = await bucket.list({ prefix: REVISION_PREFIX, cursor, limit: 250 });
    for (const item of listed.objects || []) {
      if (!item?.key?.endsWith('.json')) continue;
      const object = await bucket.get(item.key);
      const revision = object ? await object.json().catch(() => null) : null;
      if (!revision) continue;
      const candidatos = [revision.idPersoa, revision.id, revision.rowId].map(clean);
      if (candidatos.some((value) => refs.has(value))) {
        await bucket.delete(item.key);
        total += 1;
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return total;
}

async function limparR2Eliminacion(env, result) {
  const idPersoa = clean(result?.idPersoa);
  const rowId = clean(result?.rowId);
  const ficha = claveFichaValida(result?.fichaR2Key);
  const deleted = { foto: 0, revisions: 0, ficha: false };
  if (!env.R2_PRIVADO) return deleted;
  if (ficha && env.R2_PRIVADO.delete) {
    await env.R2_PRIVADO.delete(ficha);
    deleted.ficha = true;
  }
  if (idPersoa) deleted.foto += await borrarPrefix(env.R2_PRIVADO, `persoas/fotos/${idPersoa}/`);
  if (rowId && rowId !== idPersoa) deleted.foto += await borrarPrefix(env.R2_PRIVADO, `persoas/fotos/${rowId}/`);
  deleted.revisions = await limparRevisionsDaPersoa(env.R2_PRIVADO, [idPersoa, rowId]);

  const index = await lerPhotoIndex(env);
  if (index?.persoas && typeof index.persoas === 'object') {
    delete index.persoas[idPersoa];
    delete index.persoas[rowId];
    await env.R2_PRIVADO.put(photoIndexKey(env), JSON.stringify({ ...index, actualizadaEn: new Date().toISOString() }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
    });
  }
  return deleted;
}

function compararPersoas(a, b) {
  const aa = [a?.primeiroApelido, a?.segundoApelido, a?.nome].map(clean).join(' ');
  const bb = [b?.primeiroApelido, b?.segundoApelido, b?.nome].map(clean).join(' ');
  return aa.localeCompare(bb, 'gl', { sensitivity: 'base' });
}

async function aplicarEscrituraEnR2(env, user, permission, action, result) {
  if (!env.R2_PRIVADO?.put) return false;
  const snapshot = await lerSnapshot(env);
  if (!snapshot?.payload?.persoas) return false;

  const payload = { ...snapshot.payload, permiso: permission };
  const persoas = [...payload.persoas];
  const idPersoa = clean(result?.idPersoa);
  const rowId = clean(result?.rowId);
  const index = persoas.findIndex((item) =>
    [item?.idPersoa, item?.id, item?.rowId].map(clean).some((value) =>
      value && (value === idPersoa || value === rowId)
    )
  );

  if (action === 'eliminar') {
    if (index >= 0) persoas.splice(index, 1);
  } else if (result?.persoa && typeof result.persoa === 'object') {
    const anterior = index >= 0 ? persoas[index] : null;
    const nova = {
      ...(anterior || {}),
      ...result.persoa,
      fotoR2: anterior?.fotoR2 || result.persoa?.fotoR2 || null
    };
    if (index >= 0) persoas[index] = nova;
    else persoas.push(nova);
  } else {
    return false;
  }

  persoas.sort(compararPersoas);
  const photoIndex = await lerPhotoIndex(env);
  const nextPayload = enriquecerFotos({
    ...payload,
    sourceVersion: clean(result?.version || snapshot.sourceVersion),
    persoas
  }, photoIndex);
  await gardarSnapshots(env, user, permission, nextPayload, result?.version || snapshot.sourceVersion);
  return true;
}

async function handleWrite(context, user, permission, action, data) {
  const map = {
    crear: 'persoasV2Crear',
    actualizar: 'persoasV2Actualizar',
    estado: 'persoasV2Estado',
    eliminar: 'persoasV2Eliminar',
    instalarSync: 'persoasV2InstalarTrigger'
  };
  const extra = {};
  if (data.persoa && typeof data.persoa === 'object') extra.persoa = data.persoa;
  if (data.datos && typeof data.datos === 'object') extra.persoa = data.datos;
  const idPersoa = clean(data.idPersoa || data.id || data.rowId);
  if (idPersoa) {
    extra.idPersoa = idPersoa;
    extra.id = idPersoa;
    extra.rowId = clean(data.rowId);
  }
  if (typeof data.activo === 'boolean') extra.activo = data.activo;
  if (data.confirmacion) extra.confirmacion = clean(data.confirmacion);

  let result;
  try {
    result = await chamarAppsScript(context.env, user, map[action], extra);
  } catch (error) {
    return json(503, { ok: false, etapa: 'APPS_SCRIPT', erro: error instanceof Error ? error.message : 'Fallou Apps Script.' });
  }
  if (!result?.ok) {
    const status = result?.codigo === 'ADMIN_REQUIRED' || result?.codigo === 'WRITE_REQUIRED' ? 403 : 400;
    return json(status, { ...result, ok: false });
  }

  let r2Eliminado = null;
  if (action === 'eliminar') {
    try { r2Eliminado = await limparR2Eliminacion(context.env, result); }
    catch (error) { console.error('A persoa eliminouse da Sheet pero fallou parte da limpeza R2:', error); }
  }

  let cacheActualizada = false;
  try {
    cacheActualizada = await aplicarEscrituraEnR2(context.env, user, permission, action, result);
  } catch (error) {
    console.error('A escritura completouse pero fallou a actualización puntual de R2:', error);
  }

  if (!cacheActualizada && action !== 'instalarSync' && typeof context.waitUntil === 'function') {
    context.waitUntil(
      consultarListado(context.env, user, permission)
        .catch((error) => console.warn('Non se puido reconstruír Persoas en R2 en segundo plano:', error))
    );
  }

  return json(200, {
    ...result,
    ok: true,
    version: VERSION,
    sourceVersion: clean(result?.version),
    cacheActualizada,
    r2Eliminado,
    permiso: permission
  }, {
    'X-SCPP-Persoas-Version': VERSION,
    'X-SCPP-Write': 'OK',
    'X-SCPP-Cache-Update': cacheActualizada ? 'R2-PUNTUAL' : 'R2-BACKGROUND'
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'O servizo de Persoas non está configurado.' });
  }

  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  const user = await verificarFirebase(data.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });

  let permission;
  try { permission = await obterPermisoPortal(env, user, MODULO); }
  catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible comprobar os permisos.' });
  }

  const action = normalizarAction(data.accion);
  if (!actions.has(action)) return json(400, { ok: false, erro: 'Acción non permitida no módulo Persoas.' });
  const allowed = validarPermiso(permission, action);
  if (!allowed.ok) return json(allowed.status, { ok: false, erro: allowed.erro, permiso: permission });

  if (action === 'listar') {
    try {
      const { payload, fonte, savedAt, sourceVersion } = await listadoActual(env, user, permission, data.force === true);
      if (fonte === 'R2' && typeof context.waitUntil === 'function') {
        context.waitUntil(mantementoPersoas(context, user, permission, sourceVersion));
      }
      return json(200, { ...payload, fonte, cacheSavedAt: savedAt, permiso: permission }, {
        'X-SCPP-Persoas-Version': VERSION,
        'X-SCPP-Cache': fonte,
        'Server-Timing': fonte === 'R2' ? 'apps-script;dur=0' : 'apps-script;desc="rebuild"'
      });
    } catch (error) {
      return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible cargar Persoas.' });
    }
  }

  if (action === 'ficha') {
    const referencia = clean(data.idPersoa || data.id || data.rowId);
    if (!referencia) return json(400, { ok: false, erro: 'Non se indicou a persoa.' });
    try {
      const { payload } = await listadoActual(env, user, permission, false);
      const persoa = atoparPersoa(payload, referencia);
      if (!persoa) return json(404, { ok: false, erro: 'Non se atopou a persoa.' });
      return servirFicha(env, persoa);
    } catch (error) {
      return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible abrir a ficha.' });
    }
  }

  return handleWrite(context, user, permission, action, data);
}
