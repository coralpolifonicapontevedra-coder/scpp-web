import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const INDEX_MAIN = 'indices/ensaios-administracion-v3.json';
const INDEX_PREVIEW = 'indices/preview/ensaios-administracion-v3.json';
const DRAFT_PREFIX = 'ensaios/borradores-v3/';
const CONCERT_MAIN = 'indices/concertos-privado-v1.json';
const CONCERT_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const TIMEOUT_APPS_SCRIPT_MS = 20_000;

const clean = (value) => String(value ?? '').trim();
const rama = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const indexKey = (env) => rama(env) === 'main' ? INDEX_MAIN : INDEX_PREVIEW;
const concertKey = (env) => rama(env) === 'main' ? CONCERT_MAIN : CONCERT_PREVIEW;
const draftKey = (env, id) => `${DRAFT_PREFIX}${rama(env)}/${encodeURIComponent(clean(id))}.json`;
const idEnsaio = (row = {}) => clean(row.idEnsaio || row.Id_Ensaio || row.id);
const refEnsaio = (row = {}) => clean(row.ensaio || row.idEnsaio || row.Id_Ensaio);
const idObra = (row = {}) => clean(row.repertorio || row.idRepertorio || row.Id_Repertorio || row.id);

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

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
  return object ? object.json().catch(() => null) : null;
}
async function writeJson(bucket, key, value, tipo) {
  if (!bucket?.put) throw Object.assign(new Error('R2 privado non está dispoñible.'), { code: 'R2_NOT_CONFIGURED' });
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo, version: '3' }
  });
  return value;
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
      asistencias: (index.asistencias || []).filter((row) => refEnsaio(row) === id),
      repertorio: (index.ensaiosRepertorio || []).filter((row) => refEnsaio(row) === id)
    });
  }
  return result;
}

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
    ok: true,
    version: 3,
    revision: now,
    xeradoEn: new Date(now).toISOString(),
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

function indexValid(index) {
  return index?.ok === true && index?.version === 3 && Array.isArray(index.ensaios) &&
    Array.isArray(index.persoas) && Array.isArray(index.asistencias) &&
    Array.isArray(index.ensaiosRepertorio) && Array.isArray(index.repertorio);
}

async function getIndex(env, user, force = false) {
  if (!force) {
    const cached = await readJson(env.R2_PRIVADO, indexKey(env));
    if (indexValid(cached)) return { index: cached, fonte: 'R2' };
  }
  return { index: await seedIndex(env, user), fonte: 'SHEET-SEED' };
}

function booleano(value) {
  return value === true || ['true', '1', 'si', 'sí', 'yes', 'x'].includes(clean(value).toLowerCase());
}
function prepararLista(index) {
  const countA = new Map();
  const countW = new Map();
  for (const row of index.asistencias || []) {
    const id = refEnsaio(row); if (id) countA.set(id, (countA.get(id) || 0) + 1);
  }
  for (const row of index.ensaiosRepertorio || []) {
    const id = refEnsaio(row); if (id) countW.set(id, (countW.get(id) || 0) + 1);
  }
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
      cancelado: booleano(row.cancelado ?? row.Cancelado),
      obras: countW.get(id) || 0,
      asistencias: countA.get(id) || 0
    };
  }).filter((row) => row.idEnsaio).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

function resolveProgram(programa, repertorio) {
  const valid = new Set((repertorio || []).map((row) => clean(row.idRepertorio || row.id)).filter(Boolean));
  const norm = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const byTitle = new Map((repertorio || []).map((row) => [norm(row.nomeObra || row.nome), clean(row.idRepertorio || row.id)]).filter(([k, v]) => k && v));
  return [...new Set((Array.isArray(programa) ? programa : []).map((item) => {
    const direct = clean(item.idRepertorio || item.obraId || item.repertorio || item.id);
    if (direct && valid.has(direct)) return direct;
    return byTitle.get(norm(item.obra || item.titulo || item.nomeObra || item.nome)) || '';
  }).filter(Boolean))];
}

async function cargarProgramaConcerto(env, user, idConcerto, idNovoEnsaio, index) {
  if (!idConcerto || !idNovoEnsaio) return { engadidas: 0, aviso: '' };
  const concerto = (index.concertos || []).find((row) => clean(row.id || row.idConcerto) === idConcerto);
  let ids = resolveProgram(concerto?.programa || concerto?.repertorio || [], index.repertorio);
  if (!ids.length) {
    try {
      const xestion = await apps(env, user, 'obterXestionConcertoAdministracionPortal', { idConcerto });
      ids = resolveProgram(xestion?.programa || [], index.repertorio);
    } catch (error) {
      console.warn('Non se puido obter o programa do concerto durante a alta do ensaio:', error);
    }
  }
  if (!ids.length) return { engadidas: 0, aviso: 'O ensaio creouse, pero o concerto seleccionado non ten obras resolubles no programa.' };
  let engadidas = 0;
  for (const idRepertorio of ids.slice(0, 80)) {
    await apps(env, user, 'gardarEnsaioRepertorioPortal', {
      idEnsaio: idNovoEnsaio, idRepertorio, tipoTraballo: '', desde: '', ata: '', observacions: ''
    });
    engadidas += 1;
  }
  return { engadidas, aviso: '' };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  const body = await request.json().catch(() => null);
  if (!body) return json(400, { ok: false, erro: 'Solicitude non válida.' });

  let user;
  try { user = await firebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  let permiso;
  try { permiso = await permisoEnsaios(env, user); }
  catch { return json(503, { ok: false, erro: 'Non foi posible comprobar o permiso de Ensaios.' }); }

  const accion = clean(body.accion || 'listar');
  const escritura = new Set(['crear', 'cambiarData', 'darBaixa']);
  if (accion === 'listar' && permiso?.podeLer !== true) return json(403, { ok: false, erro: 'Non tes permiso de lectura en Ensaios.' });
  if (escritura.has(accion) && permiso?.podeEscribir !== true) return json(403, { ok: false, erro: 'Non tes permiso de escritura en Ensaios.' });
  if (accion === 'eliminar' && permiso?.podeAdministrar !== true) return json(403, { ok: false, erro: 'Só a administración de Ensaios pode eliminar un ensaio.' });

  try {
    if (accion === 'listar') {
      const { index, fonte } = await getIndex(env, user, body.forzar === true);
      return json(200, { ok: true, nivel: permiso.nivel, ensaios: prepararLista(index), index, almacen: fonte }, { 'X-SCPP-Storage': fonte });
    }

    if (accion === 'crear') {
      const data = clean(body.data), horaInicio = clean(body.horaInicio), tipoEnsaio = clean(body.tipoEnsaio);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !horaInicio || !tipoEnsaio) {
        return json(400, { ok: false, erro: 'Data, hora de inicio e tipo de ensaio son obrigatorios.' });
      }
      const concerto = clean(body.concerto);
      const base = concerto
        ? (await getIndex(env, user, false)).index
        : { concertos: [], repertorio: [] };
      const result = await apps(env, user, 'gardarEnsaioPortal', {
        data, horaInicio, horaFin: clean(body.horaFin), lugar: clean(body.lugar), tipoEnsaio,
        concerto, descricion: clean(body.descricion), observacions: clean(body.observacions), cancelado: false
      });
      const resultado = result.resultado || result;
      const novoId = clean(resultado.idEnsaio || resultado.id);
      let programa = { engadidas: 0, aviso: '' };
      try { programa = await cargarProgramaConcerto(env, user, concerto, novoId, base); }
      catch (error) {
        console.error('O ensaio creouse, pero fallou a carga automática do programa:', error);
        programa = { engadidas: 0, aviso: 'O ensaio creouse, pero non foi posible cargar automaticamente o programa do concerto.' };
      }
      const index = await seedIndex(env, user);
      return json(200, { ok: true, resultado: { ...resultado, obrasPrograma: programa.engadidas, avisoPrograma: programa.aviso }, ensaios: prepararLista(index), index, almacen: 'SHEET+R2' });
    }

    if (accion === 'cambiarData') {
      const id = clean(body.idEnsaio), data = clean(body.data);
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return json(400, { ok: false, erro: 'Indica un ensaio e unha data válida.' });
      await apps(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio: id, data, cancelado: false });
      const index = await seedIndex(env, user);
      return json(200, { ok: true, ensaios: prepararLista(index), index, almacen: 'SHEET+R2' });
    }

    if (accion === 'darBaixa') {
      const id = clean(body.idEnsaio);
      if (!id) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });
      await apps(env, user, 'actualizarEnsaioAdministracionPortal', { idEnsaio: id, cancelado: true });
      const index = await seedIndex(env, user);
      return json(200, { ok: true, ensaios: prepararLista(index), index, almacen: 'SHEET+R2' });
    }

    if (accion === 'eliminar') {
      const id = clean(body.idEnsaio);
      if (!id) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });
      await apps(env, user, 'eliminarEnsaioPortal', { idEnsaio: id });
      await env.R2_PRIVADO.delete(draftKey(env, id)).catch(() => {});
      const index = await seedIndex(env, user);
      return json(200, { ok: true, ensaios: prepararLista(index), index, almacen: 'SHEET+R2' });
    }

    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 502;
    return json(status, { ok: false, codigo: code, erro: error?.message || 'Non foi posible completar a operación.' });
  }
}
