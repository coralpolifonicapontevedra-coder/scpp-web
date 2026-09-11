import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const INDEX_MAIN = 'indices/ensaios-admin-v4.json';
const INDEX_PREVIEW = 'indices/preview/ensaios-admin-v4.json';
const LEGACY_INDEX_MAIN = 'indices/ensaios-administracion-v3.json';
const LEGACY_INDEX_PREVIEW = 'indices/preview/ensaios-administracion-v3.json';
const USER_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';
const DRAFT_PREFIX = 'ensaios/admin-v4/borradores/';
const LEGACY_DRAFT_PREFIX = 'ensaios/borradores-v1/';
const CONCERT_MAIN = 'indices/concertos-privado-v1.json';
const CONCERT_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const TIMEOUT_APPS_SCRIPT_MS = 30_000;
const TOKEN_CACHE_MS = 10 * 60 * 1000;
const INDEX_REFRESH_MS = 15 * 60 * 1000;

const tokenCache = new Map();
const clean = (value) => String(value ?? '').trim();
const rama = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const indexKey = (env) => rama(env) === 'main' ? INDEX_MAIN : INDEX_PREVIEW;
const legacyIndexKey = (env) => rama(env) === 'main' ? LEGACY_INDEX_MAIN : LEGACY_INDEX_PREVIEW;
const concertKey = (env) => rama(env) === 'main' ? CONCERT_MAIN : CONCERT_PREVIEW;
const draftKey = (env, id) => `${DRAFT_PREFIX}${rama(env)}/${encodeURIComponent(clean(id))}.json`;
const idEnsaio = (row = {}) => clean(row.ensaio || row.idEnsaio || row.Id_Ensaio || row.id);
const idPersoa = (row = {}) => clean(row.persoa || row.idPersoa || row.Id_Persoa || row.id);
const idObra = (row = {}) => clean(row.repertorio || row.idRepertorio || row.Id_Repertorio || row.id);
const bool = (value) => value === true || ['true', '1', 'si', 'sí', 'yes', 'x'].includes(clean(value).toLowerCase());

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});
const fail = (status, codigo, erro, extra = {}) => json(status, { ok: false, codigo, erro, ...extra });

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  return object ? object.json().catch(() => null) : null;
}
async function writeJson(bucket, key, value, tipo) {
  if (!bucket?.put) throw Object.assign(new Error('R2 privado non está dispoñible.'), { code: 'R2_NOT_CONFIGURED' });
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo, version: '4' }
  });
  return value;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function trimTokenCache() {
  const now = Date.now();
  for (const [key, value] of tokenCache.entries()) {
    if (!value || Number(value.expires || 0) <= now) tokenCache.delete(key);
  }
  while (tokenCache.size > 100) tokenCache.delete(tokenCache.keys().next().value);
}

async function firebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const cached = tokenCache.get(token);
  if (cached?.expires > Date.now()) return cached.user;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  const verified = { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
  tokenCache.set(token, { user: verified, expires: Date.now() + TOKEN_CACHE_MS });
  trimTokenCache();
  return verified;
}
async function permisoEnsaios(env, user) {
  let permiso = await obterPermisoPortalCacheado(env, user, 'ensaios');
  if (!permiso) permiso = await obterPermisoPortal(env, user, 'ensaios');
  return permiso;
}
async function apps(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: user.email,
    uidFirebase: user.uid,
    ...datos
  }, { timeoutMs: TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs: 10_000 });
  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

function fingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16)}-${text.length}`;
}
function revisionEnsaio(index, id) {
  return fingerprint({
    ensaio: (index?.ensaios || []).find((row) => idEnsaio(row) === id) || null,
    obras: (index?.ensaiosRepertorio || []).filter((row) => idEnsaio(row) === id),
    asistencias: (index?.asistencias || []).filter((row) => idEnsaio(row) === id)
  });
}
function indexValid(index) {
  return index?.ok === true && index?.version === 4 && Array.isArray(index.ensaios) &&
    Array.isArray(index.persoas) && Array.isArray(index.asistencias) &&
    Array.isArray(index.ensaiosRepertorio) && Array.isArray(index.repertorio);
}
function indexUsable(index) {
  return indexValid(index) && index.ensaios.length > 0;
}
function sourceArraysValid(source) {
  return source?.ok === true && Array.isArray(source.ensaios) && Array.isArray(source.persoas) &&
    Array.isArray(source.asistencias) && Array.isArray(source.ensaiosRepertorio) && Array.isArray(source.repertorio);
}
function indexAge(index) {
  const value = Number(index?.revision) || Date.parse(clean(index?.xeradoEn));
  return Number.isFinite(value) ? Math.max(0, Date.now() - value) : Number.POSITIVE_INFINITY;
}
async function concertos(env) {
  let index = await readJson(env.R2_PRIVADO, concertKey(env));
  if ((!index?.ok || !Array.isArray(index.concertos)) && concertKey(env) !== CONCERT_MAIN) {
    index = await readJson(env.R2_PRIVADO, CONCERT_MAIN);
  }
  return index?.ok && Array.isArray(index.concertos) ? index.concertos : [];
}
function recoveredIndex(source, currentConcerts = []) {
  const now = Date.now();
  return {
    ok: true,
    version: 4,
    revision: Number(source?.revision) || now,
    xeradoEn: clean(source?.xeradoEn) || new Date(now).toISOString(),
    ensaios: Array.isArray(source?.ensaios) ? source.ensaios : [],
    persoas: Array.isArray(source?.persoas) ? source.persoas : [],
    asistencias: Array.isArray(source?.asistencias) ? source.asistencias : [],
    ensaiosRepertorio: Array.isArray(source?.ensaiosRepertorio) ? source.ensaiosRepertorio : [],
    repertorio: Array.isArray(source?.repertorio) ? source.repertorio : [],
    concertos: Array.isArray(source?.concertos) ? source.concertos : currentConcerts,
    seguimento: source?.seguimento || {}
  };
}
async function latestUserCache(env) {
  let cursor;
  let best = null;
  for (let page = 0; page < 2; page += 1) {
    const listed = await env.R2_PRIVADO.list({ prefix: USER_CACHE_PREFIX, cursor, limit: 100 });
    for (const object of listed.objects || []) {
      const entry = await readJson(env.R2_PRIVADO, object.key);
      const source = entry?.payload;
      if (source?.ok !== true || source?.version !== 2 || !Array.isArray(source.ensaios) || !source.ensaios.length) continue;
      const savedAt = Number(entry.savedAt || 0);
      if (!best || savedAt > best.savedAt) best = { savedAt, source };
    }
    if (best || !listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return best?.source || null;
}
async function cachedFallbackIndex(env) {
  const current = await readJson(env.R2_PRIVADO, indexKey(env));
  if (indexUsable(current)) return { index: current, fonte: 'R2' };

  const legacy = await readJson(env.R2_PRIVADO, legacyIndexKey(env));
  if (legacy?.ok === true && Array.isArray(legacy.ensaios) && legacy.ensaios.length) {
    const index = recoveredIndex(legacy, await concertos(env));
    if (indexUsable(index)) {
      await writeJson(env.R2_PRIVADO, indexKey(env), index, 'indice-ensaios-admin-v4-recuperado').catch(() => {});
      return { index, fonte: 'R2-LEGACY' };
    }
  }

  const shared = await latestUserCache(env);
  if (shared) {
    const index = recoveredIndex(shared, await concertos(env));
    if (indexUsable(index)) {
      await writeJson(env.R2_PRIVADO, indexKey(env), index, 'indice-ensaios-admin-v4-recuperado').catch(() => {});
      return { index, fonte: 'R2-COMPARTIDO' };
    }
  }
  return null;
}
async function seedIndex(env, user) {
  const result = await apps(env, user, 'listarEnsaiosPortal');
  if (!sourceArraysValid(result)) {
    throw Object.assign(new Error('A resposta de Ensaios está incompleta; mantense a última copia válida.'), { code: 'INVALID_UPSTREAM' });
  }
  if (result.ensaios.length === 0) {
    throw Object.assign(new Error('A Sheet devolveu cero ensaios de forma inesperada; mantense a última copia válida.'), { code: 'EMPTY_UPSTREAM' });
  }
  const now = Date.now();
  const index = {
    ok: true,
    version: 4,
    revision: now,
    xeradoEn: new Date(now).toISOString(),
    ensaios: result.ensaios,
    persoas: result.persoas,
    asistencias: result.asistencias,
    ensaiosRepertorio: result.ensaiosRepertorio,
    repertorio: result.repertorio,
    concertos: await concertos(env),
    seguimento: result.seguimento || {}
  };
  await writeJson(env.R2_PRIVADO, indexKey(env), index, 'indice-ensaios-admin-v4');
  return index;
}
async function getIndex(env, user, force = false) {
  const fallback = await cachedFallbackIndex(env);
  if (!force && fallback?.index) return fallback;
  try {
    return { index: await seedIndex(env, user), fonte: 'SHEET' };
  } catch (error) {
    if (fallback?.index) return { index: fallback.index, fonte: `${fallback.fonte}-STALE`, aviso: error?.message || '' };
    throw error;
  }
}
async function refreshInBackground(context, user, index, fonte) {
  if (!context?.waitUntil || !index || fonte === 'SHEET' || indexAge(index) < INDEX_REFRESH_MS) return;
  context.waitUntil(seedIndex(context.env, user).catch((error) => {
    console.warn('Non se puido actualizar Ensaios en segundo plano; mantense R2:', error);
  }));
}

function normalizarObra(row, ensaio, orde = 999) {
  return {
    ensaio,
    repertorio: idObra(row),
    orde: Number(row?.orde) || orde,
    tipoTraballo: clean(row?.tipoTraballo),
    desde: clean(row?.desde),
    ata: clean(row?.ata),
    observacions: clean(row?.observacions)
  };
}
function normalizarAsistencia(row, ensaio) {
  return {
    ensaio,
    persoa: idPersoa(row),
    estadoAsistencia: clean(row?.estadoAsistencia),
    xustificada: bool(row?.xustificada),
    motivo: clean(row?.motivo),
    observacions: clean(row?.observacions)
  };
}
function draftFromIndex(index, ensaio) {
  const repertorio = (index.ensaiosRepertorio || []).filter((row) => idEnsaio(row) === ensaio)
    .map((row, i) => normalizarObra(row, ensaio, i + 1)).filter((row) => row.repertorio);
  const asistencias = (index.asistencias || []).filter((row) => idEnsaio(row) === ensaio)
    .map((row) => normalizarAsistencia(row, ensaio)).filter((row) => row.persoa && row.estadoAsistencia);
  return {
    version: 4,
    idEnsaio: ensaio,
    baseRevision: revisionEnsaio(index, ensaio),
    dirty: false,
    updatedAt: new Date().toISOString(),
    repertorio,
    asistencias
  };
}
function draftValid(draft, ensaio) {
  return draft?.version === 4 && draft?.idEnsaio === ensaio && Array.isArray(draft.repertorio) && Array.isArray(draft.asistencias);
}
async function saveDraft(env, draft) {
  return writeJson(env.R2_PRIVADO, draftKey(env, draft.idEnsaio), { ...draft, updatedAt: new Date().toISOString() }, 'borrador-ensaios-admin-v4');
}
async function getDraft(env, index, ensaio) {
  const saved = await readJson(env.R2_PRIVADO, draftKey(env, ensaio));
  if (!draftValid(saved, ensaio)) return saveDraft(env, draftFromIndex(index, ensaio));
  if (saved.dirty === true) return saved;
  if (clean(saved.baseRevision) === revisionEnsaio(index, ensaio)) return saved;
  return saveDraft(env, draftFromIndex(index, ensaio));
}

function resolveProgram(programa, repertorio) {
  const ids = new Set((repertorio || []).map((row) => clean(row.idRepertorio || row.id)).filter(Boolean));
  const norm = (v) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const byTitle = new Map((repertorio || []).map((row) => [norm(row.nomeObra || row.nome), clean(row.idRepertorio || row.id)]).filter(([k, v]) => k && v));
  return [...new Set((Array.isArray(programa) ? programa : []).map((item) => {
    const direct = clean(item.idRepertorio || item.obraId || item.repertorio || item.id);
    if (direct && ids.has(direct)) return direct;
    return byTitle.get(norm(item.obra || item.titulo || item.nomeObra || item.nome)) || '';
  }).filter(Boolean))];
}
async function engadirProgramaAoDraft(env, index, draft, idConcerto) {
  if (!idConcerto) return draft;
  const concerto = (index.concertos || []).find((row) => clean(row.id || row.idConcerto) === idConcerto);
  const ids = resolveProgram(concerto?.programa || concerto?.repertorio || [], index.repertorio);
  if (!ids.length) return draft;
  const map = new Map((draft.repertorio || []).map((row) => [idObra(row), row]));
  ids.forEach((id, i) => { if (!map.has(id)) map.set(id, normalizarObra({ repertorio: id, orde: map.size + i + 1 }, draft.idEnsaio, map.size + i + 1)); });
  return saveDraft(env, { ...draft, dirty: true, repertorio: [...map.values()] });
}

async function avisosCoralistas(env, index, ensaio, draft) {
  const key = `${LEGACY_DRAFT_PREFIX}${await sha256(ensaio)}.json`;
  const legacy = await readJson(env.R2_PRIVADO, key);
  if (legacy?.version !== 1 || !Array.isArray(legacy.asistencias)) return [];
  const confirmed = new Map((index.asistencias || []).filter((row) => idEnsaio(row) === ensaio).map((row) => [idPersoa(row), normalizarAsistencia(row, ensaio)]));
  const current = new Map((draft?.asistencias || []).map((row) => [idPersoa(row), row]));
  const people = new Map((index.persoas || []).map((row) => [idPersoa(row), row]));
  return legacy.asistencias.map((raw) => normalizarAsistencia(raw, ensaio)).filter((notice) => {
    if (!notice.persoa || clean(notice.estadoAsistencia).toLowerCase() !== 'non asiste') return false;
    const base = confirmed.get(notice.persoa);
    return !base || JSON.stringify(base) !== JSON.stringify(notice);
  }).map((notice) => {
    const person = people.get(notice.persoa) || {};
    return {
      ...notice,
      nome: clean(person.nomeCompleto) || [person.nome, person.primeiroApelido, person.segundoApelido].map(clean).filter(Boolean).join(' '),
      voz: clean(person.voz),
      aceptadoEnBorrador: JSON.stringify(current.get(notice.persoa) || null) === JSON.stringify(notice)
    };
  });
}

function resumo(index) {
  const countA = new Map();
  const countW = new Map();
  (index.asistencias || []).forEach((row) => { const id = idEnsaio(row); if (id) countA.set(id, (countA.get(id) || 0) + 1); });
  (index.ensaiosRepertorio || []).forEach((row) => { const id = idEnsaio(row); if (id) countW.set(id, (countW.get(id) || 0) + 1); });
  return (index.ensaios || []).map((row) => {
    const id = idEnsaio(row);
    return {
      idEnsaio: id,
      data: clean(row.data || row.Data).slice(0, 10),
      horaInicio: clean(row.horaInicio || row.HoraInicio),
      horaFin: clean(row.horaFin || row.HoraFin),
      lugar: clean(row.lugar || row.Lugar),
      tipoEnsaio: clean(row.tipoEnsaio || row.TipoEnsaio) || 'Ensaio',
      concerto: clean(row.concerto || row.Concerto),
      concertoNome: clean(row.concertoNome || row.ConcertoNome),
      descricion: clean(row.descricion || row.Descricion),
      observacions: clean(row.observacions || row.Observacions),
      cancelado: bool(row.cancelado ?? row.Cancelado),
      obras: countW.get(id) || 0,
      asistencias: countA.get(id) || 0
    };
  }).filter((row) => row.idEnsaio).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

async function saveProvisionalIndex(env, base, rehearsal) {
  if (!base || !rehearsal || !idEnsaio(rehearsal)) return base;
  const rows = [...(base.ensaios || [])];
  const id = idEnsaio(rehearsal);
  const pos = rows.findIndex((row) => idEnsaio(row) === id);
  if (pos >= 0) rows[pos] = { ...rows[pos], ...rehearsal };
  else rows.push(rehearsal);
  const index = { ...base, ensaios: rows, revision: Date.now(), xeradoEn: new Date().toISOString() };
  await writeJson(env.R2_PRIVADO, indexKey(env), index, 'indice-ensaios-admin-v4-provisional').catch(() => {});
  return index;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return fail(500, 'MISSING_CONFIG', 'O servizo non está configurado correctamente.');
  const body = await request.json().catch(() => null);
  if (!body) return fail(400, 'INVALID_JSON', 'Solicitude non válida.');

  let user;
  try { user = await firebase(body.idToken, env.FIREBASE_API_KEY); } catch { return fail(503, 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.'); }
  if (!user) return fail(401, 'INVALID_SESSION', 'A identificación non é válida ou caducou.');

  let permiso;
  try { permiso = await permisoEnsaios(env, user); } catch { return fail(503, 'PERMISSION_UNAVAILABLE', 'Non foi posible comprobar o permiso de Ensaios.'); }
  const accion = clean(body.accion || 'listar');
  const readOnly = new Set(['listar', 'abrir']);
  if (readOnly.has(accion) ? permiso?.podeLer !== true : permiso?.podeEscribir !== true) {
    return fail(403, 'FORBIDDEN', readOnly.has(accion) ? 'Non tes permiso de lectura en Ensaios.' : 'Non tes permiso de escritura en Ensaios.');
  }
  if (accion === 'eliminar' && permiso?.podeAdministrar !== true) return fail(403, 'FORBIDDEN', 'Só a administración de Ensaios pode eliminar un ensaio.');

  try {
    if (accion === 'listar') {
      const { index, fonte, aviso } = await getIndex(env, user, body.forzar === true);
      await refreshInBackground(context, user, index, fonte);
      return json(200, { ok: true, nivel: permiso.nivel, ensaios: resumo(index), index, almacen: fonte, aviso: aviso || '' }, { 'X-SCPP-Storage': fonte });
    }

    if (accion === 'crear') {
      const data = clean(body.data), horaInicio = clean(body.horaInicio), tipoEnsaio = clean(body.tipoEnsaio);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !horaInicio || !tipoEnsaio) return fail(400, 'INVALID_DATA', 'Data, hora de inicio e tipo de ensaio son obrigatorios.');
      const concerto = clean(body.concerto);
      const result = await apps(env, user, 'gardarEnsaioPortal', {
        data, horaInicio, horaFin: clean(body.horaFin), lugar: clean(body.lugar), tipoEnsaio,
        concerto, descricion: clean(body.descricion), observacions: clean(body.observacions), cancelado: false
      });
      const id = clean(result?.resultado?.idEnsaio || result?.resultado?.id || result?.idEnsaio || result?.id);
      let index;
      let avisoIndice = '';
      let r2Pendente = false;
      try {
        index = await seedIndex(env, user);
      } catch (error) {
        const fallback = await cachedFallbackIndex(env);
        index = fallback?.index || recoveredIndex({ ok: true, ensaios: [], persoas: [], asistencias: [], ensaiosRepertorio: [], repertorio: [] }, await concertos(env));
        if (id) {
          index = await saveProvisionalIndex(env, index, {
            idEnsaio: id, data, horaInicio, horaFin: clean(body.horaFin), lugar: clean(body.lugar), tipoEnsaio,
            concerto, concertoNome: '', descricion: clean(body.descricion), observacions: clean(body.observacions), cancelado: false
          });
        }
        avisoIndice = 'O ensaio gardouse na Sheet. A actualización completa de R2 queda pendente e farase na seguinte carga.';
        r2Pendente = true;
      }
      let draft = id ? await getDraft(env, index, id) : null;
      if (draft && concerto) draft = await engadirProgramaAoDraft(env, index, draft, concerto);
      return json(200, { ok: true, idEnsaio: id, ensaios: resumo(index), index, draft, programaPendente: draft?.dirty === true, almacen: r2Pendente ? 'SHEET+R2-PENDENTE' : 'SHEET+R2', r2Pendente, avisoIndice });
    }

    const ensaio = clean(body.idEnsaio);
    if (!ensaio) return fail(400, 'INVALID_DATA', 'Falta identificar o ensaio.');

    if (accion === 'abrir') {
      const { index, fonte } = await getIndex(env, user, false);
      await refreshInBackground(context, user, index, fonte);
      const draft = await getDraft(env, index, ensaio);
      const conflito = draft.dirty === true && clean(draft.baseRevision) !== revisionEnsaio(index, ensaio);
      return json(200, { ok: true, index, draft, conflito, avisos: await avisosCoralistas(env, index, ensaio, draft), almacen: fonte });
    }

    if (accion === 'descartar') {
      const { index } = await getIndex(env, user, true);
      const draft = await saveDraft(env, draftFromIndex(index, ensaio));
      return json(200, { ok: true, index, draft, avisos: await avisosCoralistas(env, index, ensaio, draft), almacen: 'SHEET+R2' });
    }

    if (accion === 'cambiarData') {
      const data = clean(body.data);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return fail(400, 'INVALID_DATA', 'Indica unha data válida.');
      await apps(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio: ensaio, data, cancelado: false });
      try {
        const index = await seedIndex(env, user);
        return json(200, { ok: true, index, ensaios: resumo(index), almacen: 'SHEET+R2' });
      } catch {
        const fallback = await cachedFallbackIndex(env);
        const current = fallback?.index;
        const row = current?.ensaios?.find((item) => idEnsaio(item) === ensaio);
        const index = row ? await saveProvisionalIndex(env, current, { ...row, data, cancelado: false }) : current;
        return json(200, { ok: true, index, ensaios: resumo(index || { ensaios: [], asistencias: [], ensaiosRepertorio: [] }), almacen: 'SHEET+R2-PENDENTE', r2Pendente: true });
      }
    }

    if (accion === 'darBaixa') {
      await apps(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio: ensaio, cancelado: true });
      try {
        const index = await seedIndex(env, user);
        return json(200, { ok: true, index, ensaios: resumo(index), almacen: 'SHEET+R2' });
      } catch {
        const fallback = await cachedFallbackIndex(env);
        const current = fallback?.index;
        const row = current?.ensaios?.find((item) => idEnsaio(item) === ensaio);
        const index = row ? await saveProvisionalIndex(env, current, { ...row, cancelado: true }) : current;
        return json(200, { ok: true, index, ensaios: resumo(index || { ensaios: [], asistencias: [], ensaiosRepertorio: [] }), almacen: 'SHEET+R2-PENDENTE', r2Pendente: true });
      }
    }

    if (accion === 'eliminar') {
      await apps(env, user, 'eliminarEnsaioPortal', { idEnsaio: ensaio });
      await env.R2_PRIVADO.delete(draftKey(env, ensaio)).catch(() => {});
      try {
        const index = await seedIndex(env, user);
        return json(200, { ok: true, index, ensaios: resumo(index), sheetEliminada: true, r2Pendente: false, almacen: 'SHEET+R2' });
      } catch {
        const fallback = await cachedFallbackIndex(env);
        const current = fallback?.index;
        let index = current;
        if (current) {
          index = { ...current, ensaios: current.ensaios.filter((row) => idEnsaio(row) !== ensaio), revision: Date.now(), xeradoEn: new Date().toISOString() };
          await writeJson(env.R2_PRIVADO, indexKey(env), index, 'indice-ensaios-admin-v4-provisional').catch(() => {});
        }
        return json(200, { ok: true, index, ensaios: resumo(index || { ensaios: [], asistencias: [], ensaiosRepertorio: [] }), sheetEliminada: true, r2Pendente: true, aviso: 'O ensaio eliminouse da Sheet. R2 actualizarase completamente na seguinte sincronización.', almacen: 'SHEET+R2-PENDENTE' });
      }
    }

    const { index } = await getIndex(env, user, false);
    let draft = await getDraft(env, index, ensaio);

    if (accion === 'gardarObra') {
      const rid = clean(body.idRepertorio);
      if (!rid) return fail(400, 'INVALID_DATA', 'Falta identificar a obra.');
      const map = new Map(draft.repertorio.map((row) => [idObra(row), row]));
      const prev = map.get(rid) || {};
      map.set(rid, normalizarObra({ ...prev, repertorio: rid, orde: body.orde || prev.orde || map.size + 1, tipoTraballo: body.tipoTraballo ?? prev.tipoTraballo, desde: body.desde ?? prev.desde, ata: body.ata ?? prev.ata, observacions: body.observacions ?? prev.observacions }, ensaio, map.size + 1));
      draft = await saveDraft(env, { ...draft, dirty: true, repertorio: [...map.values()] });
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }

    if (accion === 'quitarObra') {
      const rid = clean(body.idRepertorio);
      draft = await saveDraft(env, { ...draft, dirty: true, repertorio: draft.repertorio.filter((row) => idObra(row) !== rid) });
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }

    if (accion === 'gardarAsistencia') {
      const persoa = clean(body.idPersoa);
      if (!persoa) return fail(400, 'INVALID_DATA', 'Falta identificar a persoa.');
      const map = new Map(draft.asistencias.map((row) => [idPersoa(row), row]));
      const state = clean(body.estadoAsistencia);
      if (!state) map.delete(persoa);
      else map.set(persoa, normalizarAsistencia({ persoa, estadoAsistencia: state, xustificada: body.xustificada, motivo: body.motivo, observacions: body.observacions }, ensaio));
      draft = await saveDraft(env, { ...draft, dirty: true, asistencias: [...map.values()] });
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }

    if (accion === 'cargarPrograma') {
      draft = await engadirProgramaAoDraft(env, index, draft, clean(body.idConcerto));
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }

    if (accion === 'aceptarAviso') {
      const persoa = clean(body.idPersoa);
      const map = new Map(draft.asistencias.map((row) => [idPersoa(row), row]));
      map.set(persoa, normalizarAsistencia({ persoa, estadoAsistencia: 'Non asiste', xustificada: body.xustificada, motivo: body.motivo, observacions: body.observacions }, ensaio));
      draft = await saveDraft(env, { ...draft, dirty: true, asistencias: [...map.values()] });
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }

    if (accion === 'finalizar') {
      const fresh = await seedIndex(env, user);
      if (clean(draft.baseRevision) !== revisionEnsaio(fresh, ensaio)) {
        return fail(409, 'DRAFT_CONFLICT', 'A Sheet cambiou desde que se abriu o borrador. Recarga desde Sheet antes de finalizar.', { conflito: true });
      }
      await apps(env, user, 'reconciliarEnsaioAdministracionV4', {
        idEnsaio: ensaio,
        obras: draft.repertorio,
        asistencias: draft.asistencias
      });
      try {
        const indexFinal = await seedIndex(env, user);
        const cleanDraft = await saveDraft(env, draftFromIndex(indexFinal, ensaio));
        return json(200, { ok: true, index: indexFinal, draft: cleanDraft, ensaios: resumo(indexFinal), sheetSincronizada: true, r2Pendente: false, almacen: 'SHEET+R2' });
      } catch {
        await saveDraft(env, { ...draft, dirty: false, sheetSincronizada: true, r2Pendente: true }).catch(() => {});
        return json(200, { ok: true, draft: { ...draft, dirty: false }, sheetSincronizada: true, r2Pendente: true, aviso: 'A Sheet quedou sincronizada. A copia R2 actualizarase na seguinte carga.', almacen: 'SHEET+R2-PENDENTE' });
      }
    }

    return fail(400, 'ACTION_NOT_ALLOWED', 'Acción non permitida.');
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 502;
    return fail(status, code, error?.message || 'Non foi posible completar a operación.');
  }
}