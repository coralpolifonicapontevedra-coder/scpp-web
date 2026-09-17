import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const REPERTORIO_ADMIN_MAIN = 'repertorio/cache/administracion/main/listado-v2.json';
const REPERTORIO_ADMIN_PREVIEW = 'repertorio/cache/administracion/preview/listado-v2.json';
const REPERTORIO_CATALOGO_MAIN = 'repertorio/cache/catalogo.json';
const REPERTORIO_CATALOGO_PREVIEW = 'repertorio/cache/preview/catalogo.json';
const CONCERTOS_MAIN = 'indices/concertos-privado-v1.json';
const CONCERTOS_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const ASISTENCIAS_MAIN = 'indices/asistencias-concertos.json';
const ASISTENCIAS_PREVIEW = 'indices/preview/asistencias-concertos.json';
const FIREBASE_TIMEOUT_MS = 8000;

const clean = (value) => String(value ?? '').trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

function branch(env) {
  return clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
}

function draftKey(env, id) {
  return `concertos/borradores-v1/${branch(env)}/${encodeURIComponent(clean(id))}.json`;
}

function repertorioAdminKey(env) {
  return branch(env) === 'main' ? REPERTORIO_ADMIN_MAIN : REPERTORIO_ADMIN_PREVIEW;
}

function repertorioCatalogoKey(env) {
  return branch(env) === 'main' ? REPERTORIO_CATALOGO_MAIN : REPERTORIO_CATALOGO_PREVIEW;
}

function concertosKey(env) {
  return branch(env) === 'main' ? CONCERTOS_MAIN : CONCERTOS_PREVIEW;
}

function asistenciasKey(env) {
  return branch(env) === 'main' ? ASISTENCIAS_MAIN : ASISTENCIAS_PREVIEW;
}

async function fetchConLimite(url, options, timeoutMs) {
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
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    FIREBASE_TIMEOUT_MS
  );
  if (!response.ok) return null;
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  return { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
}

async function permisoConcertos(env, user) {
  let permiso = await obterPermisoPortalCacheado(env, user, 'concertos');
  if (!permiso) permiso = await obterPermisoPortal(env, user, 'concertos');
  return permiso;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function readJson(bucket, key) {
  const object = await bucket?.get?.(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function writeJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo: 'borrador-concerto', version: '1' }
  });
  return value;
}

function personFromR2(row = {}) {
  return {
    id: clean(row.idPersoa || row.id || row.Id || row.ID),
    nome: clean(row.nome || row.Nome),
    primeiroApelido: clean(row.primeiroApelido || row.PrimeiroApelido || row['Primeiro apelido']),
    segundoApelido: clean(row.segundoApelido || row.SegundoApelido || row['Segundo apelido']),
    voz: clean(row.voz || row.Voz),
    estado: '',
    xustificacion: ''
  };
}

function workFromAdmin(row = {}) {
  return {
    id: clean(row.Id ?? row.id ?? row.Id_Repertorio ?? row.idRepertorio),
    nome: clean(row.NomeObra ?? row.nomeObra ?? row.nome ?? row.obra),
    autor: clean(row.Compositor ?? row.compositor ?? row.autor)
  };
}

function workFromCatalog(row = {}) {
  return {
    id: clean(row.idRepertorio || row.id || row.Id),
    nome: clean(row.nomeObra || row.nome || row.obra || row.NomeObra),
    autor: clean(row.compositor || row.autor || row.Compositor)
  };
}

function programaDesdeIndice(index, id) {
  const concert = (index?.concertos || []).find((c) => clean(c.id) === id);
  return (concert?.programa || []).map((p, pos) => ({
    obraId: clean(p.idRepertorio || p.obraId || p.id),
    orde: Number(p.orde || pos + 1),
    notas: clean(p.notas),
    solista: clean(p.solista)
  })).filter((p) => p.obraId);
}

function fullNameKey(p) {
  const apelidos = [clean(p.primeiroApelido), clean(p.segundoApelido)].filter(Boolean).join(' ');
  return `${clean(p.voz).toLowerCase()}|${`${apelidos}, ${clean(p.nome)}`.replace(/^,\s*/, '').toLowerCase()}`;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok:false, erro:'O servizo non está configurado correctamente.' });

  const body = await request.json().catch(() => null);
  if (!body || clean(body.accion) !== 'obterXestion') return json(400, { ok:false, erro:'Acción non permitida.' });
  const id = clean(body.idConcerto);
  if (!id) return json(400, { ok:false, erro:'Falta identificar o concerto.' });

  const user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });

  const permiso = await permisoConcertos(env, user).catch(() => null);
  if (!permiso?.podeLer) return json(403, { ok:false, erro:'Non tes permiso de lectura no módulo Concertos.' });

  const emailHash = await hashEmail(user.email);
  const [saved, adminPersoas, repertorioAdmin, repertorioCatalogo, concertIndex, attendance] = await Promise.all([
    readJson(env.R2_PRIVADO, draftKey(env, id)),
    readJson(env.R2_PRIVADO, `${ADMIN_CACHE_PREFIX}${emailHash}.json`),
    readJson(env.R2_PRIVADO, repertorioAdminKey(env)),
    readJson(env.R2_PRIVADO, repertorioCatalogoKey(env)),
    readJson(env.R2_PRIVADO, concertosKey(env)),
    readJson(env.R2_PRIVADO, asistenciasKey(env))
  ]);

  const persoasBase = (adminPersoas?.payload?.persoas || []).map(personFromR2).filter((p) => p.id && p.nome && p.voz);
  const obrasAdmin = Array.isArray(repertorioAdmin?.payload?.obras)
    ? repertorioAdmin.payload.obras.map(workFromAdmin).filter((o) => o.id && o.nome)
    : [];
  const obrasCatalogo = (repertorioCatalogo?.obras || []).map(workFromCatalog).filter((o) => o.id && o.nome);
  const obras = obrasAdmin.length ? obrasAdmin : obrasCatalogo;

  if (!persoasBase.length || !obras.length) {
    return json(503, { ok:false, erro:'Os catálogos de persoas ou repertorio non están dispoñibles en R2.' });
  }

  const savedStates = new Map((saved?.persoas || []).map((p) => [clean(p.id), {
    estado: clean(p.estado),
    xustificacion: clean(p.xustificacion)
  }]));
  const attendees = attendance?.resultado?.asistenciasPorConcerto?.[id] || [];
  const attendanceKeys = new Set(attendees.map((a) => `${clean(a.voz).toLowerCase()}|${clean(a.nome).toLowerCase()}`));

  const persoas = persoasBase.map((p) => {
    const anterior = savedStates.get(p.id);
    if (anterior) return { ...p, ...anterior };
    if (attendanceKeys.has(fullNameKey(p))) return { ...p, estado:'asiste' };
    return p;
  });

  const programa = Array.isArray(saved?.programa)
    ? saved.programa
    : programaDesdeIndice(concertIndex, id);

  const draft = {
    version: 1,
    idConcerto: id,
    updatedAt: new Date().toISOString(),
    programa,
    persoas,
    obras,
    catalogoRepertorio: obrasAdmin.length ? 'R2-ADMIN-SNAPSHOT' : 'R2-CATALOGO'
  };

  await writeJson(env.R2_PRIVADO, draftKey(env, id), draft);

  return json(200, {
    ok:true,
    ...draft,
    nivel:permiso.nivel,
    almacen:'R2-REFRESH',
    totalObras:obras.length
  });
}
