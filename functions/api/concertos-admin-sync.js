import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_SYNC_APPS_SCRIPT_MS = 70_000;
const ATTENDANCE_INDEX_KEY = 'indices/asistencias-concertos.json';
const CONCERT_INDEX_KEY = 'indices/concertos-privado-v1.json';

const clean = (value = '') => String(value || '').trim();
const branch = (env = {}) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const draftKey = (env, id) => `concertos/borradores-v1/${branch(env)}/${encodeURIComponent(clean(id))}.json`;
const attendanceKey = (env) => branch(env) === 'main' ? ATTENDANCE_INDEX_KEY : 'indices/preview/asistencias-concertos.json';
const concertIndexKey = (env) => branch(env) === 'main' ? CONCERT_INDEX_KEY : 'indices/preview/concertos-privado-v1.json';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-SCPP-Concertos-Sync': 'v1'
  }
});

function erro(status, etapa, codigo, mensaxe) {
  return json(status, { ok: false, etapa, codigo, erro: mensaxe });
}

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
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
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  return {
    uid: clean(data.localId),
    email: clean(data.email).toLowerCase()
  };
}

async function permisoConcertos(env, user) {
  let permiso = await obterPermisoPortalCacheado(env, user, 'concertos');
  if (!permiso) permiso = await obterPermisoPortal(env, user, 'concertos');
  return permiso;
}

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    return await object.json();
  } catch {
    return null;
  }
}

async function writeJson(bucket, key, value, type) {
  if (!bucket?.put) throw Object.assign(new Error('R2 privado non está configurado.'), { code: 'R2_NOT_CONFIGURED' });
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo: type, version: '1' }
  });
  return value;
}

async function readConcertIndex(env) {
  const target = concertIndexKey(env);
  let current = await readJson(env.R2_PRIVADO, target);
  if (!current && target !== CONCERT_INDEX_KEY) current = await readJson(env.R2_PRIVADO, CONCERT_INDEX_KEY);
  return current;
}

async function chamarAppsScriptSync(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(
    env,
    {
      token: env.WEB_WRITE_TOKEN,
      accion,
      email: user.email,
      uidFirebase: user.uid,
      ...datos
    },
    {
      timeoutMs: TIMEOUT_SYNC_APPS_SCRIPT_MS,
      attemptTimeoutMs: TIMEOUT_SYNC_APPS_SCRIPT_MS
    }
  );

  if (!resultado?.ok) {
    const mensaxe = resultado?.erro || `Apps Script non puido completar ${accion}.`;
    const codigo = resultado?.codigo || (/non autorizado/i.test(mensaxe) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(mensaxe), { code: codigo, accion });
  }
  return resultado;
}

function normalizar(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function eDirectora(p = {}) {
  const tipo = normalizar(p.tipoSocio || p.tipo);
  const cargo = normalizar(p.cargo);
  const nome = normalizar([p.nome, p.primeiroApelido, p.segundoApelido].filter(Boolean).join(' '));
  if (tipo === 'director' || tipo === 'directora' || tipo.startsWith('director a ')) return true;
  if (cargo === 'director' || cargo === 'directora' || cargo.includes('direccion musical')) return true;
  return nome.includes('nanette') && nome.includes('sanchez') && nome.includes('ordaz');
}

function persoasParaSheet(draft) {
  const validos = new Set(['asiste', 'non_asiste', 'xustificada']);
  return (Array.isArray(draft?.persoas) ? draft.persoas : [])
    .filter((p) => !eDirectora(p))
    .filter((p) => validos.has(clean(p.estado)))
    .map((p) => ({
      ...p,
      estado: clean(p.estado),
      xustificacion: clean(p.estado) === 'xustificada' ? clean(p.xustificacion) : ''
    }));
}

function attendeeList(persoas) {
  return persoas
    .filter((p) => p.estado === 'asiste')
    .map((p) => ({
      nome: `${[clean(p.primeiroApelido), clean(p.segundoApelido)].filter(Boolean).join(' ')}, ${clean(p.nome)}`.replace(/^,\s*/, ''),
      voz: clean(p.voz) || 'Sen voz indicada'
    }))
    .filter((p) => p.nome);
}

async function updateAttendanceIndex(env, idConcerto, persoas) {
  const target = attendanceKey(env);
  let current = await readJson(env.R2_PRIVADO, target);
  if (!current && target !== ATTENDANCE_INDEX_KEY) current = await readJson(env.R2_PRIVADO, ATTENDANCE_INDEX_KEY);
  const result = current?.resultado?.ok ? current.resultado : { ok: true, asistenciasPorConcerto: {} };
  const porConcerto = {
    ...(result.asistenciasPorConcerto || {}),
    [idConcerto]: attendeeList(persoas)
  };
  return writeJson(
    env.R2_PRIVADO,
    target,
    {
      gardadoEn: Date.now(),
      resultado: { ...result, ok: true, asistenciasPorConcerto: porConcerto }
    },
    'indice-asistencias-concertos'
  );
}

async function updateConcertIndex(env, draft) {
  const target = concertIndexKey(env);
  const current = await readConcertIndex(env);
  if (!current?.ok || !Array.isArray(current.concertos)) {
    throw Object.assign(new Error('O índice privado de concertos non está dispoñible.'), { code: 'R2_CONCERT_INDEX_MISSING' });
  }

  const works = new Map((draft.obras || []).map((o) => [clean(o.id), o]));
  const programa = (draft.programa || []).map((p, index) => {
    const work = works.get(clean(p.obraId)) || {};
    return {
      idRepertorio: clean(p.obraId),
      orde: index + 1,
      obra: clean(work.nome) || clean(p.obraId),
      autor: clean(work.autor),
      notas: clean(p.notas),
      solista: clean(p.solista)
    };
  });

  const concertos = current.concertos.map((c) =>
    clean(c.id) === draft.idConcerto ? { ...c, programa } : c
  );

  return writeJson(
    env.R2_PRIVADO,
    target,
    {
      ...current,
      concertos,
      xeradoEn: new Date().toISOString(),
      xeradoEnMs: Date.now(),
      actualizadoDesde: 'ADMIN-CONCERTOS-SYNC'
    },
    'indice-concertos-privado'
  );
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return erro(405, 'REQUEST', 'METHOD_NOT_ALLOWED', 'Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return erro(500, 'CONFIG', 'MISSING_CONFIG', 'O servizo non está configurado correctamente.');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return erro(400, 'REQUEST', 'INVALID_JSON', 'Solicitude non válida.');
  }

  if (clean(body?.accion) !== 'finalizarXestion') {
    return erro(400, 'REQUEST', 'ACTION_NOT_ALLOWED', 'Esta ruta só finaliza a xestión dun concerto.');
  }

  let user;
  try {
    user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY);
  } catch {
    return erro(503, 'FIREBASE', 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.');
  }
  if (!user) return erro(401, 'AUTH', 'INVALID_SESSION', 'A identificación non é válida ou caducou.');

  let permiso;
  try {
    permiso = await permisoConcertos(env, user);
  } catch (error) {
    return erro(503, 'AUTH', 'PERMISSION_UNAVAILABLE', error?.message || 'Non foi posible comprobar os permisos.');
  }
  if (permiso?.podeEscribir !== true) {
    return erro(403, 'AUTH', 'FORBIDDEN', 'Non tes permiso de escritura no módulo Concertos.');
  }

  const id = clean(body.idConcerto);
  if (!id) return erro(400, 'REQUEST', 'INVALID_DATA', 'Falta identificar o concerto.');

  const draft = await readJson(env.R2_PRIVADO, draftKey(env, id));
  if (!draft || draft.version !== 1 || draft.idConcerto !== id) {
    return erro(409, 'R2', 'DRAFT_MISSING', 'O borrador do concerto non está dispoñible. Abre de novo Xestionar e volve gardar.');
  }

  const persoas = persoasParaSheet(draft);
  const index = await readConcertIndex(env);
  const concerto = (index?.concertos || []).find((c) => clean(c.id) === id);
  const medios = {};
  const cartel = clean(concerto?.cartel);
  const triptico = clean(concerto?.triptico);
  if (cartel) medios.cartel = cartel;
  if (triptico) medios.triptico = triptico;

  try {
    if (Object.keys(medios).length) {
      await chamarAppsScriptSync(env, user, 'actualizarConcertoAdministracionPortal', {
        idConcerto: id,
        ...medios
      });
    }

    await chamarAppsScriptSync(env, user, 'gardarProgramaConcertoAdministracionPortal', {
      idConcerto: id,
      programa: Array.isArray(draft.programa) ? draft.programa : []
    });

    await chamarAppsScriptSync(env, user, 'gardarAsistentesConcertoAdministracionPortal', {
      idConcerto: id,
      persoas
    });
  } catch (error) {
    const codigo = error?.code || 'APPS_SCRIPT_SYNC';
    const status = codigo === 'FORBIDDEN' ? 403 : codigo.includes('TIMEOUT') || error?.name === 'AbortError' ? 504 : 502;
    const accion = clean(error?.accion);
    const detalle = accion ? ` (${accion})` : '';
    return erro(status, 'APPS_SCRIPT', codigo, `${error?.message || 'Non foi posible sincronizar coa Sheet.'}${detalle}`);
  }

  try {
    await Promise.all([
      updateAttendanceIndex(env, id, persoas),
      updateConcertIndex(env, { ...draft, idConcerto: id })
    ]);
  } catch (error) {
    return erro(500, 'R2', error?.code || 'R2_SYNC', `A Sheet quedou actualizada, pero fallou a actualización de R2: ${error?.message || 'erro descoñecido'}`);
  }

  return json(200, {
    ok: true,
    almacen: 'SHEET+R2',
    resumo: {
      obras: Array.isArray(draft.programa) ? draft.programa.length : 0,
      asistencias: attendeeList(persoas).length,
      rexistros: persoas.length,
      medios: Object.values(medios).filter(Boolean).length
    }
  });
}
