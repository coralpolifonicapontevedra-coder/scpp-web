import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const CONCERT_INDEX_KEY = 'indices/concertos-privado-v1.json';
const ATTENDANCE_INDEX_KEY = 'indices/asistencias-concertos.json';

const clean = (value) => String(value || '').trim();
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
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  return { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
}

async function permisoConcertos(env, user) {
  let permiso = await obterPermisoPortalCacheado(env, user, 'concertos');
  if (!permiso) permiso = await obterPermisoPortal(env, user, 'concertos');
  return permiso;
}

async function readJson(bucket, key) {
  const object = await bucket?.get?.(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

function estadoConcerto(value) {
  const normal = clean(value).toLowerCase();
  return {
    previsto: 'Previsto',
    confirmado: 'Confirmado',
    aprazado: 'Aprazado',
    cancelado: 'Cancelado',
    realizado: 'Realizado'
  }[normal] || clean(value);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (clean(env.CF_PAGES_BRANCH) !== 'main') return json(409, { ok:false, erro:'Esta ruta rápida está reservada a Producción.' });

  const body = await request.json().catch(() => null);
  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });

  const permiso = await permisoConcertos(env, user).catch(() => null);
  if (!permiso?.podeLer) return json(403, { ok:false, erro:'Non tes permiso de lectura no módulo Concertos.' });

  const [index, attendance] = await Promise.all([
    readJson(env.R2_PRIVADO, CONCERT_INDEX_KEY),
    readJson(env.R2_PRIVADO, ATTENDANCE_INDEX_KEY)
  ]);
  if (!index?.ok || !Array.isArray(index.concertos)) {
    return json(503, { ok:false, erro:'O índice privado de concertos non está dispoñible.' });
  }

  const porConcerto = attendance?.resultado?.asistenciasPorConcerto || {};
  const concertos = index.concertos.map((c) => {
    const id = clean(c.id);
    const asistentes = Array.isArray(porConcerto[id]) ? porConcerto[id] : [];
    const repertorio = Array.isArray(c.programa) ? c.programa : [];
    return {
      idConcerto: id,
      data: clean(c.data),
      nome: clean(c.nome),
      cidade: clean(c.cidade),
      lugar: clean(c.lugar),
      hora: clean(c.hora),
      estado: estadoConcerto(c.estado),
      mostrarWeb: c.mostrarWeb === true,
      destacadoWeb: c.destacadoWeb === true,
      caracteristicas: clean(c.caracteristicas),
      cartel: clean(c.cartel),
      triptico: clean(c.triptico),
      asistencias: asistentes.length,
      obras: repertorio.length,
      asistentes,
      repertorio
    };
  }).filter((c) => c.idConcerto).sort((a, b) => String(b.data).localeCompare(String(a.data)));

  return json(200, {
    ok:true,
    nivel:permiso.nivel,
    permiso,
    concertos,
    almacen:'R2-PRODUCION',
    fonte:CONCERT_INDEX_KEY,
    xeradoEn:index.xeradoEn || null,
    xeradoEnMs:index.xeradoEnMs || null
  });
}
