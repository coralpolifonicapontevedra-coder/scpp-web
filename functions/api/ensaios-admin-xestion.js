import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const INDEX_MAIN = 'indices/ensaios-administracion-v3.json';
const INDEX_PREVIEW = 'indices/preview/ensaios-administracion-v3.json';
const DRAFT_PREFIX = 'ensaios/borradores-v3/';
const LEGACY_DRAFT_PREFIX = 'ensaios/borradores-v1/';
const CONCERT_MAIN = 'indices/concertos-privado-v1.json';
const CONCERT_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const TIMEOUT_APPS_SCRIPT_MS = 20_000;

const clean = (v) => String(v ?? '').trim();
const rama = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const indexKey = (env) => rama(env) === 'main' ? INDEX_MAIN : INDEX_PREVIEW;
const concertKey = (env) => rama(env) === 'main' ? CONCERT_MAIN : CONCERT_PREVIEW;
const draftKey = (env, id) => `${DRAFT_PREFIX}${rama(env)}/${encodeURIComponent(clean(id))}.json`;
const idEnsaio = (r = {}) => clean(r.ensaio || r.idEnsaio || r.Id_Ensaio || r.id);
const idPersoa = (r = {}) => clean(r.persoa || r.idPersoa || r.Id_Persoa || r.id);
const idObra = (r = {}) => clean(r.repertorio || r.idRepertorio || r.Id_Repertorio || r.id);

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
  const obj = await bucket.get(key);
  return obj ? obj.json().catch(() => null) : null;
}
async function writeJson(bucket, key, value, tipo) {
  if (!bucket?.put) throw Object.assign(new Error('R2 privado non está dispoñible.'), { code: 'R2_NOT_CONFIGURED' });
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo, version: '3' }
  });
  return value;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function legacyDraftKey(id) { return `${LEGACY_DRAFT_PREFIX}${await sha256(id)}.json`; }

async function firebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}
async function permisoEnsaios(env, user) {
  let permiso = await obterPermisoPortalCacheado(env, user, 'ensaios');
  if (!permiso) permiso = await obterPermisoPortal(env, user, 'ensaios');
  return permiso;
}
async function apps(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN, accion, email: user.email, uidFirebase: user.uid, ...datos
  }, { timeoutMs: TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs: 8_000 });
  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

function asistencia(row, ensaio) {
  return {
    ensaio,
    persoa: idPersoa(row),
    estadoAsistencia: clean(row.estadoAsistencia),
    xustificada: row.xustificada === true || ['true', '1', 'si', 'sí', 'yes', 'x'].includes(clean(row.xustificada).toLowerCase()),
    motivo: clean(row.motivo),
    observacions: clean(row.observacions)
  };
}
function obra(row, ensaio, orde = 999) {
  return {
    ensaio,
    repertorio: idObra(row),
    orde: Number(row.orde) || orde,
    tipoTraballo: clean(row.tipoTraballo),
    desde: clean(row.desde),
    ata: clean(row.ata),
    observacions: clean(row.observacions)
  };
}
function indexValid(index) {
  return index?.ok === true && index?.version === 3 && Array.isArray(index.ensaios) && Array.isArray(index.persoas) &&
    Array.isArray(index.asistencias) && Array.isArray(index.ensaiosRepertorio) && Array.isArray(index.repertorio);
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
function revisionPorEnsaio(index) {
  const ids = new Set((index.ensaios || []).map(idEnsaio).filter(Boolean));
  const result = {};
  for (const id of ids) {
    result[id] = fingerprint({
      ensaio: (index.ensaios || []).find((row) => idEnsaio(row) === id) || null,
      asistencias: (index.asistencias || []).filter((row) => idEnsaio(row) === id),
      repertorio: (index.ensaiosRepertorio || []).filter((row) => idEnsaio(row) === id)
    });
  }
  return result;
}
function revisionEnsaio(index, ensaio) { return clean(index?.revisionPorEnsaio?.[ensaio]); }

async function concertos(env) {
  let index = await readJson(env.R2_PRIVADO, concertKey(env));
  if ((!index?.ok || !Array.isArray(index.concertos)) && concertKey(env) !== CONCERT_MAIN) {
    index = await readJson(env.R2_PRIVADO, CONCERT_MAIN);
  }
  return index?.ok && Array.isArray(index.concertos) ? index.concertos : [];
}
async function seedIndex(env, user) {
  const result = await apps(env, user, 'listarEnsaiosPortal');
  const now = Date.now();
  const index = {
    ok: true, version: 3, revision: now, xeradoEn: new Date(now).toISOString(),
    ensaios: Array.isArray(result.ensaios) ? result.ensaios : [],
    persoas: Array.isArray(result.persoas) ? result.persoas : [],
    asistencias: Array.isArray(result.asistencias) ? result.asistencias : [],
    ensaiosRepertorio: Array.isArray(result.ensaiosRepertorio) ? result.ensaiosRepertorio : [],
    repertorio: Array.isArray(result.repertorio) ? result.repertorio : [],
    concertos: await concertos(env),
    seguimento: result.seguimento || {}
  };
  index.revisionPorEnsaio = revisionPorEnsaio(index);
  await writeJson(env.R2_PRIVADO, indexKey(env), index, 'indice-ensaios-administracion');
  return index;
}
async function getIndex(env, user, force = false) {
  if (!force) {
    const cached = await readJson(env.R2_PRIVADO, indexKey(env));
    if (indexValid(cached)) return { index: cached, fonte: 'R2' };
  }
  return { index: await seedIndex(env, user), fonte: 'SHEET-SEED' };
}

function draftFromIndex(index, ensaio) {
  const repertorio = (index.ensaiosRepertorio || []).filter((row) => idEnsaio(row) === ensaio)
    .map((row, i) => obra(row, ensaio, i + 1)).filter((row) => row.repertorio);
  const asistencias = (index.asistencias || []).filter((row) => idEnsaio(row) === ensaio)
    .map((row) => asistencia(row, ensaio)).filter((row) => row.persoa);
  return {
    version: 3,
    idEnsaio: ensaio,
    baseRevision: revisionEnsaio(index, ensaio),
    dirty: false,
    updatedAt: new Date().toISOString(),
    repertorio,
    asistencias,
    baseRepertorio: repertorio.map((row) => ({ ...row })),
    baseAsistencias: asistencias.map((row) => ({ ...row }))
  };
}
function draftValid(draft, ensaio) {
  return draft?.version === 3 && draft?.idEnsaio === ensaio && Array.isArray(draft.repertorio) &&
    Array.isArray(draft.asistencias) && Array.isArray(draft.baseRepertorio) && Array.isArray(draft.baseAsistencias);
}
async function saveDraft(env, draft) {
  return writeJson(env.R2_PRIVADO, draftKey(env, draft.idEnsaio), { ...draft, updatedAt: new Date().toISOString() }, 'borrador-ensaio');
}
async function getDraft(env, index, ensaio) {
  const saved = await readJson(env.R2_PRIVADO, draftKey(env, ensaio));
  if (!draftValid(saved, ensaio)) return saveDraft(env, draftFromIndex(index, ensaio));
  if (saved.dirty === true) return saved;
  if (clean(saved.baseRevision) === revisionEnsaio(index, ensaio)) return saved;
  return saveDraft(env, draftFromIndex(index, ensaio));
}
function conflitoDraft(draft, index) {
  return draft?.dirty === true && clean(draft.baseRevision) !== revisionEnsaio(index, draft.idEnsaio);
}

function eqAtt(a, b) {
  return clean(a?.estadoAsistencia) === clean(b?.estadoAsistencia) && (a?.xustificada === true) === (b?.xustificada === true) &&
    clean(a?.motivo) === clean(b?.motivo) && clean(a?.observacions) === clean(b?.observacions);
}
function eqWork(a, b) {
  return clean(a?.tipoTraballo) === clean(b?.tipoTraballo) && clean(a?.desde) === clean(b?.desde) &&
    clean(a?.ata) === clean(b?.ata) && clean(a?.observacions) === clean(b?.observacions);
}
async function seq(items, worker) { for (const item of items) await worker(item); }
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

async function avisosCoralistas(env, index, ensaio, adminDraft) {
  const legacy = await readJson(env.R2_PRIVADO, await legacyDraftKey(ensaio));
  if (legacy?.version !== 1 || !Array.isArray(legacy.asistencias)) return [];
  const confirmed = new Map((index.asistencias || []).filter((row) => idEnsaio(row) === ensaio).map((row) => [idPersoa(row), asistencia(row, ensaio)]));
  const admin = new Map((adminDraft?.asistencias || []).map((row) => [idPersoa(row), row]));
  const people = new Map((index.persoas || []).map((row) => [idPersoa(row), row]));
  const avisos = [];
  for (const raw of legacy.asistencias) {
    if (idEnsaio(raw) !== ensaio) continue;
    const notice = asistencia(raw, ensaio);
    if (!notice.persoa || clean(notice.estadoAsistencia).toLowerCase() !== 'non asiste') continue;
    const base = confirmed.get(notice.persoa);
    if (base && eqAtt(base, notice)) continue;
    const person = people.get(notice.persoa) || {};
    const current = admin.get(notice.persoa);
    avisos.push({
      idPersoa: notice.persoa,
      nome: clean(person.nomeCompleto) || [person.nome, person.primeiroApelido, person.segundoApelido].map(clean).filter(Boolean).join(' '),
      voz: clean(person.voz),
      estadoAsistencia: notice.estadoAsistencia,
      xustificada: notice.xustificada,
      motivo: notice.motivo,
      observacions: notice.observacions,
      aceptadoEnBorrador: current ? eqAtt(current, notice) : false
    });
  }
  return avisos;
}

async function finalizar(env, user, draft) {
  const freshBefore = await seedIndex(env, user);
  if (conflitoDraft(draft, freshBefore)) {
    throw Object.assign(new Error('A Sheet cambiou desde que comezaches a editar este ensaio. Recarga desde Sheet antes de finalizar para non sobrescribir cambios máis recentes.'), { code: 'DRAFT_CONFLICT' });
  }

  const baseW = new Map(draft.baseRepertorio.map((row) => [idObra(row), row]));
  const nowW = new Map(draft.repertorio.map((row) => [idObra(row), row]));
  const baseA = new Map(draft.baseAsistencias.map((row) => [idPersoa(row), row]));
  const nowA = new Map(draft.asistencias.map((row) => [idPersoa(row), row]));
  const delW = [...baseW.keys()].filter((id) => id && !nowW.has(id));
  const saveW = [...nowW.values()].filter((row) => !baseW.has(idObra(row)) || !eqWork(baseW.get(idObra(row)), row));
  const delA = [...baseA.keys()].filter((id) => id && !nowA.has(id));
  const saveA = [...nowA.values()].filter((row) => !baseA.has(idPersoa(row)) || !eqAtt(baseA.get(idPersoa(row)), row));

  await seq(delW, (idRepertorio) => apps(env, user, 'eliminarEnsaioRepertorioPortal', { idEnsaio: draft.idEnsaio, idRepertorio }));
  await seq(saveW, (row) => apps(env, user, 'gardarEnsaioRepertorioPortal', {
    idEnsaio: draft.idEnsaio, idRepertorio: idObra(row), tipoTraballo: row.tipoTraballo,
    desde: row.desde, ata: row.ata, observacions: row.observacions
  }));
  await seq(delA, (idPersoaValue) => apps(env, user, 'eliminarAsistenciaEnsaioPortal', { idEnsaio: draft.idEnsaio, idPersoa: idPersoaValue }));
  await seq(saveA, (row) => apps(env, user, 'gardarAsistenciaEnsaioPortal', {
    idEnsaio: draft.idEnsaio, idPersoa: idPersoa(row), estadoAsistencia: row.estadoAsistencia,
    xustificada: row.xustificada === true, motivo: row.motivo, observacions: row.observacions
  }));

  const fresh = await seedIndex(env, user);
  const synced = await saveDraft(env, draftFromIndex(fresh, draft.idEnsaio));
  return {
    draft: synced,
    index: fresh,
    resumo: { obrasGardadas: saveW.length, obrasEliminadas: delW.length, asistenciasGardadas: saveA.length, asistenciasEliminadas: delA.length }
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return fail(500, 'MISSING_CONFIG', 'O servizo non está configurado correctamente.');
  let body;
  try { body = await request.json(); } catch { return fail(400, 'INVALID_JSON', 'Solicitude non válida.'); }
  let user;
  try { user = await firebase(body.idToken, env.FIREBASE_API_KEY); } catch { return fail(503, 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.'); }
  if (!user) return fail(401, 'INVALID_SESSION', 'A identificación non é válida ou caducou.');

  let permiso;
  try { permiso = await permisoEnsaios(env, user); } catch { return fail(503, 'PERMISSION_UNAVAILABLE', 'Non foi posible comprobar o permiso de Ensaios.'); }
  const accion = clean(body.accion || 'obterXestion');
  const readOnly = accion === 'listar' || accion === 'obterXestion';
  if (readOnly ? permiso?.podeLer !== true : permiso?.podeEscribir !== true) {
    return fail(403, 'FORBIDDEN', readOnly ? 'Non tes permiso de lectura en Ensaios.' : 'Non tes permiso de escritura en Ensaios.');
  }

  try {
    if (accion === 'listar') {
      const { index, fonte } = await getIndex(env, user, body.forzar === true);
      return json(200, { ok: true, index, nivel: permiso.nivel, almacen: fonte }, { 'X-SCPP-Storage': fonte });
    }

    const ensaio = clean(body.idEnsaio);
    if (!ensaio) return fail(400, 'INVALID_DATA', 'Falta identificar o ensaio.');

    if (accion === 'obterXestion') {
      const { index, fonte } = await getIndex(env, user, body.refrescarBase !== false);
      const draft = await getDraft(env, index, ensaio);
      const conflito = conflitoDraft(draft, index);
      const avisos = await avisosCoralistas(env, index, ensaio, draft);
      return json(200, { ok: true, draft, avisos, conflito, indexRevision: revisionEnsaio(index, ensaio), almacen: fonte }, { 'X-SCPP-Storage': fonte });
    }

    const { index } = await getIndex(env, user, false);
    let draft = await getDraft(env, index, ensaio);
    if (conflitoDraft(draft, index) && accion !== 'descartar') {
      return fail(409, 'DRAFT_CONFLICT', 'A Sheet cambiou desde que se iniciou este borrador. Recarga desde Sheet antes de continuar.', { draft, conflito: true });
    }

    if (accion === 'gardarAsistencia') {
      const persoa = clean(body.idPersoa);
      if (!persoa) return fail(400, 'INVALID_DATA', 'Falta identificar a persoa.');
      const map = new Map(draft.asistencias.map((row) => [idPersoa(row), row]));
      map.set(persoa, asistencia({ persoa, estadoAsistencia: body.estadoAsistencia, xustificada: body.xustificada, motivo: body.motivo, observacions: body.observacions }, ensaio));
      draft = await saveDraft(env, { ...draft, dirty: true, asistencias: [...map.values()] });
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }
    if (accion === 'quitarAsistencia') {
      const persoa = clean(body.idPersoa);
      if (!persoa) return fail(400, 'INVALID_DATA', 'Falta identificar a persoa.');
      draft = await saveDraft(env, { ...draft, dirty: true, asistencias: draft.asistencias.filter((row) => idPersoa(row) !== persoa) });
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }
    if (accion === 'gardarObra') {
      const rid = clean(body.idRepertorio);
      if (!rid) return fail(400, 'INVALID_DATA', 'Falta identificar a obra.');
      const map = new Map(draft.repertorio.map((row) => [idObra(row), row]));
      const prev = map.get(rid) || {};
      map.set(rid, obra({ ...prev, repertorio: rid, orde: body.orde || prev.orde || map.size + 1, tipoTraballo: body.tipoTraballo ?? prev.tipoTraballo, desde: body.desde ?? prev.desde, ata: body.ata ?? prev.ata, observacions: body.observacions ?? prev.observacions }, ensaio, map.size + 1));
      draft = await saveDraft(env, { ...draft, dirty: true, repertorio: [...map.values()] });
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }
    if (accion === 'eliminarObra') {
      const rid = clean(body.idRepertorio);
      if (!rid) return fail(400, 'INVALID_DATA', 'Falta identificar a obra.');
      draft = await saveDraft(env, { ...draft, dirty: true, repertorio: draft.repertorio.filter((row) => idObra(row) !== rid) });
      return json(200, { ok: true, draft, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }
    if (accion === 'incluírProgramaConcerto') {
      const cid = clean(body.idConcerto);
      if (!cid) return fail(400, 'INVALID_DATA', 'Selecciona un concerto.');
      const concerto = (index.concertos || []).find((row) => clean(row.id || row.idConcerto) === cid);
      let ids = resolveProgram(concerto?.programa || concerto?.repertorio || [], index.repertorio);
      let fontePrograma = 'R2';
      if (!ids.length) {
        const xestion = await apps(env, user, 'obterXestionConcertoAdministracionPortal', { idConcerto: cid });
        ids = resolveProgram(xestion?.programa || [], index.repertorio);
        fontePrograma = 'SHEET';
      }
      if (!ids.length) return fail(409, 'CONCERT_WITHOUT_PROGRAM', 'O concerto seleccionado non ten obras resolubles no programa.');
      const map = new Map(draft.repertorio.map((row) => [idObra(row), row]));
      let engadidas = 0;
      for (const rid of ids.slice(0, 80)) {
        if (map.has(rid)) continue;
        map.set(rid, obra({ repertorio: rid, orde: map.size + 1 }, ensaio, map.size + 1));
        engadidas += 1;
      }
      draft = await saveDraft(env, { ...draft, dirty: true, repertorio: [...map.values()] });
      return json(200, { ok: true, draft, engadidas, fontePrograma, almacen: 'R2' }, { 'X-SCPP-Storage': 'R2-DRAFT' });
    }
    if (accion === 'descartar') {
      const fresh = await seedIndex(env, user);
      draft = await saveDraft(env, draftFromIndex(fresh, ensaio));
      const avisos = await avisosCoralistas(env, fresh, ensaio, draft);
      return json(200, { ok: true, draft, avisos, conflito: false, index: fresh, almacen: 'SHEET+R2' });
    }
    if (accion === 'finalizar') {
      const result = await finalizar(env, user, draft);
      const avisos = await avisosCoralistas(env, result.index, ensaio, result.draft);
      return json(200, { ok: true, ...result, avisos, conflito: false, almacen: 'SHEET+R2' });
    }
    return fail(400, 'ACTION_NOT_ALLOWED', 'Acción non permitida.');
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'DRAFT_CONFLICT' ? 409 : 502;
    return fail(status, code, error?.message || 'Non foi posible completar a operación.');
  }
}
