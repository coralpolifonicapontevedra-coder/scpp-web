import { obterJsonAppsScript } from '../_lib/apps-script.js';

const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const INDEX_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const ATTENDANCE_KEY_PREVIEW = 'indices/preview/asistencias-concertos.json';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const clean = (value) => String(value || '').trim();

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
  return {
    uid: clean(data.localId),
    email: clean(data.email).toLowerCase()
  };
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

async function listarDesdeSheet(env, user) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarConcertosAdministracionPortal',
    email: user.email,
    uidFirebase: user.uid
  }, { timeoutMs: 20000, attemptTimeoutMs: 8000 });

  const payload = resultado?.resultado || resultado;
  if (!payload?.ok || !Array.isArray(payload?.concertos)) {
    throw new Error(payload?.erro || 'Non foi posible ler os concertos da Sheet.');
  }
  return payload;
}

async function lerJson(bucket, key) {
  const object = await bucket?.get?.(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function limparOrfosPreview(env, idsValidos) {
  if (clean(env.CF_PAGES_BRANCH) === 'main' || !env.R2_PRIVADO) return [];

  const indice = await lerJson(env.R2_PRIVADO, INDEX_KEY_PREVIEW);
  if (!indice?.ok || !Array.isArray(indice.concertos)) return [];

  const orfos = indice.concertos
    .map((c) => clean(c?.id))
    .filter((id) => id && !id.startsWith('hist-') && !idsValidos.has(id));

  if (!orfos.length) return [];

  const eliminar = new Set(orfos);
  const concertos = indice.concertos.filter((c) => {
    const id = clean(c?.id);
    return id.startsWith('hist-') || !eliminar.has(id);
  });

  await env.R2_PRIVADO.put(INDEX_KEY_PREVIEW, JSON.stringify({
    ...indice,
    concertos,
    xeradoEn: new Date().toISOString(),
    xeradoEnMs: Date.now(),
    actualizadoDesde: 'ADMIN-CONCERTOS-RECONCILIACION-SHEET'
  }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });

  const attendance = await lerJson(env.R2_PRIVADO, ATTENDANCE_KEY_PREVIEW);
  if (attendance?.resultado?.asistenciasPorConcerto) {
    const porConcerto = { ...attendance.resultado.asistenciasPorConcerto };
    orfos.forEach((id) => delete porConcerto[id]);
    await env.R2_PRIVADO.put(ATTENDANCE_KEY_PREVIEW, JSON.stringify({
      ...attendance,
      gardadoEn: Date.now(),
      resultado: { ...attendance.resultado, asistenciasPorConcerto: porConcerto }
    }), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
    });
  }

  for (const id of orfos) {
    await env.R2_PRIVADO.delete(`concertos/borradores-v1/preview/${encodeURIComponent(id)}.json`).catch(() => {});
    const prefix = `concertos/admin/${encodeURIComponent(id)}/`;
    const list = await env.R2_PRIVADO.list({ prefix }).catch(() => null);
    if (list?.objects?.length) {
      await Promise.allSettled(list.objects.map((object) => env.R2_PRIVADO.delete(object.key)));
    }
  }

  return orfos;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'O servizo non está configurado.' });

  const body = await request.json().catch(() => null);
  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user))) return json(403, { ok: false, erro: 'Usuario non autorizado para Administración.' });

  try {
    const payload = await listarDesdeSheet(env, user);
    const idsValidos = new Set(payload.concertos.map((c) => clean(c.idConcerto)).filter(Boolean));
    const orfosEliminados = await limparOrfosPreview(env, idsValidos);
    return json(200, {
      ok: true,
      nivel: payload.nivel || 'Administración',
      concertos: payload.concertos,
      almacen: 'SHEET',
      orfosEliminados
    });
  } catch (error) {
    return json(502, { ok: false, erro: error?.message || 'Non foi posible listar os concertos.' });
  }
}
