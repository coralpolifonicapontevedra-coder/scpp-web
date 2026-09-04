import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';

const VERSION = 'persoas-v4';
const SNAPSHOT_KEY_MAIN = 'persoas/cache/snapshot-v4.json';
const SNAPSHOT_KEY_PREVIEW = 'persoas/cache/preview/snapshot-v4.json';
const PERFIS_KEY_MAIN = 'persoas/cache/perfis.json';
const PERFIS_KEY_PREVIEW = 'persoas/cache/preview/perfis.json';
const PHOTO_INDEX_MAIN = 'persoas/fotos/index.json';
const PHOTO_INDEX_PREVIEW = 'persoas/fotos/preview/index.json';
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';

const clean = (value) => String(value == null ? '' : value).trim();
const branch = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const snapshotKey = (env) => branch(env) === 'main' ? SNAPSHOT_KEY_MAIN : SNAPSHOT_KEY_PREVIEW;
const perfisKey = (env) => branch(env) === 'main' ? PERFIS_KEY_MAIN : PERFIS_KEY_PREVIEW;
const photoIndexKey = (env) => branch(env) === 'main' ? PHOTO_INDEX_MAIN : PHOTO_INDEX_PREVIEW;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  return object ? object.json().catch(() => null) : null;
}

function enrichPhotos(payload, index) {
  if (!payload?.ok || !Array.isArray(payload.persoas)) return payload;
  const map = index?.persoas && typeof index.persoas === 'object' ? index.persoas : {};
  return {
    ...payload,
    persoas: payload.persoas.map((persoa) => {
      const refs = [persoa?.idPersoa, persoa?.id, persoa?.rowId].map(clean).filter(Boolean);
      const foto = refs.map((ref) => map[ref]).find(Boolean) || null;
      return { ...persoa, fotoR2: foto };
    })
  };
}

async function refreshAdminCaches(env, payload, savedAt) {
  if (!env.R2_PRIVADO?.list || !env.R2_PRIVADO?.get || !env.R2_PRIVADO?.put) return 0;
  let cursor;
  let updated = 0;
  do {
    const listed = await env.R2_PRIVADO.list({ prefix: ADMIN_CACHE_PREFIX, cursor, limit: 250 });
    for (const objectInfo of listed.objects || []) {
      const object = await env.R2_PRIVADO.get(objectInfo.key);
      const current = object ? await object.json().catch(() => null) : null;
      if (!current?.administrador || !current?.payload) continue;
      const nextPayload = {
        ...current.payload,
        ok: true,
        version: VERSION,
        sourceVersion: payload.sourceVersion,
        persoas: payload.persoas,
        schema: payload.schema,
        textosLegais: payload.textosLegais
      };
      await env.R2_PRIVADO.put(objectInfo.key, JSON.stringify({
        ...current,
        savedAt,
        payload: nextPayload
      }), {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
      });
      updated += 1;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return updated;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.R2_PRIVADO?.put) {
    return json(500, { ok: false, erro: 'A sincronización de Persoas non está configurada.' });
  }

  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  if (!data?.token || clean(data.token) !== clean(env.WEB_WRITE_TOKEN)) {
    return json(401, { ok: false, erro: 'Non autorizado.' });
  }

  let result;
  try {
    const response = await obterJsonAppsScriptPersoas(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'persoasV2SyncListar',
      email: '',
      actorEmail: '',
      fonte: clean(data.fonte || 'sync')
    }, { timeoutMs: 30_000, attemptTimeoutMs: 12_000 });
    result = response.resultado;
  } catch (error) {
    console.error('Persoas cache sync: Apps Script fallou:', error);
    return json(503, { ok: false, erro: 'Non foi posible ler Persoas desde a Sheet.' });
  }

  if (!result?.ok || !Array.isArray(result.persoas)) {
    return json(502, { ok: false, erro: result?.erro || 'Apps Script non devolveu un listado válido.' });
  }

  const photoIndex = await readJson(env.R2_PRIVADO, photoIndexKey(env));
  const payload = enrichPhotos({
    ok: true,
    version: VERSION,
    sourceVersion: clean(result.version || data.version),
    perfil: null,
    permiso: null,
    schema: result.schema || { fields: [] },
    textosLegais: result.textosLegais || {},
    persoas: result.persoas
  }, photoIndex);

  const savedAt = Date.now();
  await Promise.all([
    env.R2_PRIVADO.put(snapshotKey(env), JSON.stringify({
      version: VERSION,
      savedAt,
      sourceVersion: payload.sourceVersion,
      payload
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
    }),
    env.R2_PRIVADO.put(perfisKey(env), JSON.stringify({
      version: VERSION,
      savedAt,
      persoas: payload.persoas
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
    })
  ]);

  const adminCaches = await refreshAdminCaches(env, payload, savedAt).catch((error) => {
    console.warn('Non se puideron refrescar todas as caches administrativas de Persoas:', error);
    return 0;
  });

  return json(200, {
    ok: true,
    version: payload.sourceVersion,
    totalPersoas: payload.persoas.length,
    adminCaches,
    fonte: clean(data.fonte || 'sync'),
    entorno: branch(env)
  });
}
