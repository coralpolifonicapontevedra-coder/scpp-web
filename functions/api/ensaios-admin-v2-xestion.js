import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const ENSAIOS_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';
const CONCERTOS_PRIVATE_INDEX_KEY = 'indices/concertos-privado-v1.json';

const clean = (value) => String(value || '').trim();
const branch = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

const tokenCache = new Map();
async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const cached = tokenCache.get(token);
  if (cached?.expires > Date.now()) return cached.user;
  const response = await fetchConLimite(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
  }, TIMEOUT_FIREBASE_MS);
  if (!response.ok) return null;
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  const user = { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
  tokenCache.set(token, { user, expires: Date.now() + 5 * 60 * 1000 });
  while (tokenCache.size > 100) tokenCache.delete(tokenCache.keys().next().value);
  return user;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function verificarAdministracionR2(env, user) {
  if (!env.R2_PRIVADO?.get) return false;
  const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const entry = await object.json().catch(() => null);
  return entry?.administrador === user.email && entry?.payload?.perfil?.nivel === 'Administración';
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: user.email,
    uidFirebase: user.uid,
    ...datos
  }, { timeoutMs: TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs: 8_000 });
  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function writeJson(bucket, key, value, tipo = 'ensaios-cache-v2') {
  if (!bucket?.put) return;
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo, version: '2' }
  });
}

async function sharedKey(user) {
  return `${ENSAIOS_CACHE_PREFIX}${await hashEmail(user.email)}.json`;
}

function payloadValido(payload) {
  return payload?.ok === true && payload?.version === 2 && Array.isArray(payload.ensaios) && Array.isArray(payload.persoas);
}

async function lerSharedEntry(env, user) {
  const entry = await readJson(env.R2_PRIVADO, await sharedKey(user));
  if (entry?.email !== user.email || !payloadValido(entry?.payload)) return null;
  return entry;
}

async function gardarSharedPayload(env, user, payload) {
  if (!payloadValido(payload)) return;
  await writeJson(env.R2_PRIVADO, await sharedKey(user), { savedAt: Date.now(), email: user.email, payload });
}

async function lerConcertosPrivados(env) {
  const previewKey = branch(env) === 'main' ? CONCERTOS_PRIVATE_INDEX_KEY : 'indices/preview/concertos-privado-v1.json';
  let index = await readJson(env.R2_PRIVADO, previewKey);
  if ((!index?.ok || !Array.isArray(index.concertos)) && previewKey !== CONCERTOS_PRIVATE_INDEX_KEY) {
    index = await readJson(env.R2_PRIVADO, CONCERTOS_PRIVATE_INDEX_KEY);
  }
  return index?.ok && Array.isArray(index.concertos) ? index.concertos : [];
}

async function crearPayload(env, result) {
  return {
    ok: true,
    version: 2,
    perfil: result.perfil || {},
    ensaios: Array.isArray(result.ensaios) ? result.ensaios : [],
    persoas: Array.isArray(result.persoas) ? result.persoas : [],
    asistencias: Array.isArray(result.asistencias) ? result.asistencias : [],
    ensaiosRepertorio: Array.isArray(result.ensaiosRepertorio) ? result.ensaiosRepertorio : [],
    repertorio: Array.isArray(result.repertorio) ? result.repertorio : [],
    concertos: await lerConcertosPrivados(env),
    seguimento: result.seguimento || {},
    xeradoEn: new Date().toISOString()
  };
}

async function obterBase(env, user) {
  const entry = await lerSharedEntry(env, user);
  if (entry) return { payload: entry.payload, fonte: 'R2-COMPARTIDO' };
  const result = await chamarAppsScript(env, user, 'listarEnsaiosPortal');
  const payload = await crearPayload(env, result);
  await gardarSharedPayload(env, user, payload);
  return { payload, fonte: 'SHEET-SEED' };
}

function prepararPersoas(result, idEnsaio) {
  const persoas = Array.isArray(result.persoas) ? result.persoas : [];
  const asistencias = Array.isArray(result.asistencias) ? result.asistencias : [];
  const porPersoa = new Map();
  asistencias.filter((a) => clean(a.ensaio) === idEnsaio).forEach((a) => porPersoa.set(clean(a.persoa), a));
  return persoas.map((p) => {
    const id = clean(p.idPersoa || p.id);
    const a = porPersoa.get(id) || null;
    let estado = '';
    if (a) estado = a.xustificada === true ? 'xustificada' : clean(a.estadoAsistencia).toLowerCase() === 'asiste' ? 'asiste' : 'non_asiste';
    return {
      id,
      nome: clean(p.nome),
      primeiroApelido: clean(p.primeiroApelido),
      segundoApelido: clean(p.segundoApelido),
      nomeCompleto: clean(p.nomeCompleto),
      voz: clean(p.voz),
      estado,
      xustificacion: clean(a?.motivo || a?.observacions)
    };
  }).filter((p) => p.id && p.voz);
}

function prepararObras(result, idEnsaio) {
  const catalogo = Array.isArray(result.repertorio) ? result.repertorio : [];
  const relacions = Array.isArray(result.ensaiosRepertorio) ? result.ensaiosRepertorio : [];
  const map = new Map(catalogo.map((obra) => [clean(obra.idRepertorio || obra.id), obra]));
  const obras = relacions.filter((row) => clean(row.ensaio || row.idEnsaio) === idEnsaio).map((row) => {
    const id = clean(row.repertorio || row.idRepertorio);
    const obra = map.get(id) || {};
    return {
      idRepertorio: id,
      nomeObra: clean(obra.nomeObra || obra.nome) || id,
      compositor: clean(obra.compositor || obra.autor),
      orde: Number(row.orde) || 0,
      tipoTraballo: clean(row.tipoTraballo),
      observacions: clean(row.observacions)
    };
  }).sort((a, b) => (a.orde || 9999) - (b.orde || 9999) || a.nomeObra.localeCompare(b.nomeObra, 'gl'));
  const repertorio = catalogo.map((obra) => ({
    idRepertorio: clean(obra.idRepertorio || obra.id),
    nomeObra: clean(obra.nomeObra || obra.nome),
    compositor: clean(obra.compositor || obra.autor)
  })).filter((obra) => obra.idRepertorio && obra.nomeObra).sort((a, b) => a.nomeObra.localeCompare(b.nomeObra, 'gl'));
  return { obras, repertorio };
}

function idProgramaConcerto(obra) {
  if (typeof obra === 'string' || typeof obra === 'number') return clean(obra);
  if (!obra || typeof obra !== 'object') return '';
  return clean(
    obra.obraId ||
    obra.idRepertorio ||
    obra.repertorio ||
    obra.Id_Repertorio ||
    obra.id_repertorio ||
    obra.id
  );
}

function normalizarProgramaConcerto(programa) {
  return (Array.isArray(programa) ? programa : [])
    .map((obra, index) => {
      const obraId = idProgramaConcerto(obra);
      if (!obraId) return null;
      if (obra && typeof obra === 'object' && !Array.isArray(obra)) {
        return { ...obra, obraId };
      }
      return { obraId, idRepertorio: obraId, orde: index + 1 };
    })
    .filter(Boolean);
}

function prepararConcertos(concertos) {
  return concertos.map((c) => {
    const programaBruto = Array.isArray(c.programa) ? c.programa : Array.isArray(c.repertorio) ? c.repertorio : [];
    const programa = normalizarProgramaConcerto(programaBruto);
    return {
      idConcerto: clean(c.id || c.idConcerto),
      data: clean(c.data),
      nome: clean(c.nome) || 'Concerto',
      repertorio: programa,
      obras: programa.length
    };
  }).filter((c) => c.idConcerto);
}

async function actualizarSharedAsistencias(env, user, idEnsaio, persoas) {
  const entry = await lerSharedEntry(env, user);
  if (!entry) return;
  const actual = Array.isArray(entry.payload.asistencias) ? entry.payload.asistencias : [];
  const ids = new Set(persoas.map((p) => clean(p.id)).filter(Boolean));
  const restantes = actual.filter((a) => !(clean(a.ensaio || a.idEnsaio) === idEnsaio && ids.has(clean(a.persoa || a.idPersoa))));
  const novas = persoas.map((p) => ({
    idAsistenciaEnsaio: '', ensaio: idEnsaio, persoa: clean(p.id),
    estadoAsistencia: clean(p.estado) === 'asiste' ? 'Asiste' : 'Non asiste',
    xustificada: clean(p.estado) === 'xustificada',
    motivo: clean(p.estado) === 'xustificada' ? clean(p.xustificacion) : '',
    observacions: clean(p.estado) === 'xustificada' ? clean(p.xustificacion) : ''
  }));
  entry.payload.asistencias = restantes.concat(novas);
  entry.payload.xeradoEn = new Date().toISOString();
  await gardarSharedPayload(env, user, entry.payload);
}

async function actualizarSharedObras(env, user, idEnsaio, idsRepertorio) {
  const entry = await lerSharedEntry(env, user);
  if (!entry) return;
  const rel = Array.isArray(entry.payload.ensaiosRepertorio) ? entry.payload.ensaiosRepertorio : [];
  const existentes = new Set(rel.filter((r) => clean(r.ensaio || r.idEnsaio) === idEnsaio).map((r) => clean(r.repertorio || r.idRepertorio)));
  let orde = existentes.size;
  for (const id of idsRepertorio.map(clean).filter(Boolean)) {
    if (existentes.has(id)) continue;
    orde += 1;
    rel.push({ idEnsaioRepertorio: '', ensaio: idEnsaio, repertorio: id, orde });
    existentes.add(id);
  }
  entry.payload.ensaiosRepertorio = rel;
  entry.payload.xeradoEn = new Date().toISOString();
  await gardarSharedPayload(env, user, entry.payload);
}

async function executarSecuencial(items, worker) {
  for (const item of items) await worker(item);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  const body = await request.json().catch(() => null);
  if (!body) return json(400, { ok: false, erro: 'Solicitude non válida.' });

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user).catch(() => false))) return json(403, { ok: false, erro: 'Usuario non autorizado para Administración.' });

  const accion = clean(body.accion);
  const idEnsaio = clean(body.idEnsaio);
  if (!idEnsaio) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });

  try {
    if (accion === 'obterXestion') {
      const [{ payload, fonte }, concertos] = await Promise.all([obterBase(env, user), lerConcertosPrivados(env)]);
      return json(200, {
        ok: true,
        persoas: prepararPersoas(payload, idEnsaio),
        ...prepararObras(payload, idEnsaio),
        concertos: prepararConcertos(concertos),
        fonte: `${fonte}/R2-CONCERTOS`
      }, { 'X-SCPP-Storage': fonte });
    }

    if (accion === 'obterObras') {
      const [{ payload, fonte }, concertos] = await Promise.all([obterBase(env, user), lerConcertosPrivados(env)]);
      return json(200, { ok: true, ...prepararObras(payload, idEnsaio), concertos: prepararConcertos(concertos), fonte: `${fonte}/R2-CONCERTOS` });
    }

    if (accion === 'gardarAsistencias') {
      const persoas = Array.isArray(body.persoas) ? body.persoas.slice(0, 100) : [];
      const validas = persoas.filter((p) => clean(p.id) && ['asiste', 'non_asiste', 'xustificada'].includes(clean(p.estado)));
      await executarSecuencial(validas, (p) => chamarAppsScript(env, user, 'gardarAsistenciaEnsaioPortal', {
        idEnsaio,
        idPersoa: clean(p.id),
        estadoAsistencia: clean(p.estado) === 'asiste' ? 'Asiste' : 'Non asiste',
        xustificada: clean(p.estado) === 'xustificada',
        motivo: clean(p.estado) === 'xustificada' ? clean(p.xustificacion) : '',
        observacions: clean(p.estado) === 'xustificada' ? clean(p.xustificacion) : ''
      }));
      await actualizarSharedAsistencias(env, user, idEnsaio, validas);
      return json(200, { ok: true, gardadas: validas.length, almacen: 'SHEET+R2' });
    }

    if (accion === 'gardarObra') {
      const idRepertorio = clean(body.idRepertorio);
      if (!idRepertorio) return json(400, { ok: false, erro: 'Selecciona unha obra do repertorio.' });
      await chamarAppsScript(env, user, 'gardarEnsaioRepertorioPortal', {
        idEnsaio, idRepertorio, tipoTraballo: clean(body.tipoTraballo), observacions: clean(body.observacions)
      });
      await actualizarSharedObras(env, user, idEnsaio, [idRepertorio]);
      return json(200, { ok: true, idRepertorio, almacen: 'SHEET+R2' });
    }

    if (accion === 'importarPrograma') {
      const idConcerto = clean(body.idConcerto);
      if (!idConcerto) return json(400, { ok: false, erro: 'Selecciona un concerto.' });

      const concertos = await lerConcertosPrivados(env);
      const concerto = concertos.find((c) => clean(c.id || c.idConcerto) === idConcerto);
      let programa = Array.isArray(concerto?.programa) ? concerto.programa : Array.isArray(concerto?.repertorio) ? concerto.repertorio : [];

      if (!programa.length) {
        const xestionConcerto = await chamarAppsScript(env, user, 'obterXestionConcertoAdministracionPortal', { idConcerto });
        programa = Array.isArray(xestionConcerto.programa) ? xestionConcerto.programa : [];
      }
      if (!programa.length) return json(409, { ok: false, erro: 'O concerto seleccionado non ten obras no programa.' });

      const ids = [...new Set(programa.map(idProgramaConcerto).filter(Boolean))];
      await executarSecuencial(ids, (idRepertorio) => chamarAppsScript(env, user, 'gardarEnsaioRepertorioPortal', { idEnsaio, idRepertorio }));
      await actualizarSharedObras(env, user, idEnsaio, ids);
      return json(200, { ok: true, engadidas: ids.length, concerto: clean(concerto?.nome || idConcerto), almacen: 'SHEET+R2' });
    }

    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : error?.name === 'AbortError' ? 504 : 502;
    return json(status, { ok: false, codigo: code, erro: error?.message || 'Non foi posible completar a operación.' });
  }
}
