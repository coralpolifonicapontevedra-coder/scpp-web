import { obterJsonAppsScript } from '../_lib/apps-script.js';

const APPS_SCRIPT_PRODUCION = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const APPS_SCRIPT_PREVIEW = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const CONCERT_INDEX_MAIN = 'indices/concertos-privado-v1.json';
const CONCERT_INDEX_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const ATTENDANCE_INDEX_MAIN = 'indices/asistencias-concertos.json';
const ATTENDANCE_INDEX_PREVIEW = 'indices/preview/asistencias-concertos.json';

const clean = (value) => String(value ?? '').trim();
const rama = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const concertIndexKey = (env) => rama(env) === 'main' ? CONCERT_INDEX_MAIN : CONCERT_INDEX_PREVIEW;
const attendanceIndexKey = (env) => rama(env) === 'main' ? ATTENDANCE_INDEX_MAIN : ATTENDANCE_INDEX_PREVIEW;
const esperadoAppsScript = (env) => rama(env) === 'main' ? APPS_SCRIPT_PRODUCION : APPS_SCRIPT_PREVIEW;
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  }
});

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ idToken:token })
  });
  if (!response.ok) return null;
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  return { uid:clean(data.localId), email:clean(data.email).toLowerCase() };
}
async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function verificarAdministracionR2(env, user) {
  const object = await env.R2_PRIVADO?.get?.(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const entry = await object.json().catch(() => null);
  return entry?.administrador === user.email && entry?.payload?.perfil?.nivel === 'Administración';
}
async function lerJson(bucket, key) {
  const object = await bucket?.get?.(key);
  return object ? object.json().catch(() => null) : null;
}
async function gardarJson(bucket, key, value, tipo) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' },
    customMetadata:{ tipo, version:'1' }
  });
}
async function limparR2(env, id) {
  const indiceKey = concertIndexKey(env);
  const indice = await lerJson(env.R2_PRIVADO, indiceKey);
  if (indice?.ok && Array.isArray(indice.concertos)) {
    await gardarJson(env.R2_PRIVADO, indiceKey, {
      ...indice,
      concertos:indice.concertos.filter((item) => clean(item?.id) !== id),
      xeradoEn:new Date().toISOString(), xeradoEnMs:Date.now(), actualizadoDesde:'ADMIN-CONCERTOS-ELIMINAR'
    }, 'indice-concertos-privado');
  }

  const asistenciaKey = attendanceIndexKey(env);
  const asistencias = await lerJson(env.R2_PRIVADO, asistenciaKey);
  if (asistencias?.resultado?.asistenciasPorConcerto) {
    const porConcerto = { ...asistencias.resultado.asistenciasPorConcerto };
    delete porConcerto[id];
    await gardarJson(env.R2_PRIVADO, asistenciaKey, {
      ...asistencias,
      gardadoEn:Date.now(),
      resultado:{ ...asistencias.resultado, asistenciasPorConcerto:porConcerto }
    }, 'indice-asistencias-concertos');
  }

  await env.R2_PRIVADO.delete(`concertos/borradores-v1/${rama(env)}/${encodeURIComponent(id)}.json`);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (clean(env.APPS_SCRIPT_WEBAPP_URL) !== esperadoAppsScript(env)) return json(409, { ok:false, erro:`O contorno ${rama(env)} non está conectado ao Apps Script esperado.` });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok:false, erro:'O servizo non está configurado correctamente.' });

  const body = await request.json().catch(() => null);
  const id = clean(body?.idConcerto);
  if (!id) return json(400, { ok:false, erro:'Falta identificar o concerto.' });
  if (id.startsWith('hist-')) return json(403, { ok:false, erro:'Os concertos históricos non se poden eliminar desde Administración.' });
  if (clean(body?.confirmacion) !== `ELIMINAR ${id}`) return json(400, { ok:false, erro:'A confirmación de eliminación non é válida.' });

  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user))) return json(403, { ok:false, erro:'Usuario non autorizado para Administración.' });

  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token:env.WEB_WRITE_TOKEN,
      accion:'eliminarConcertoAdministracionPortal',
      email:user.email,
      uidFirebase:user.uid,
      idConcerto:id
    }, { timeoutMs:25000, attemptTimeoutMs:25000 });

    const payload = resultado?.resultado || resultado;
    if (!resultado?.ok || payload?.ok === false) return json(502, { ok:false, erro:resultado?.erro || payload?.erro || 'Apps Script non puido eliminar o concerto.' });

    await limparR2(env, id);
    return json(200, {
      ok:true,
      resultado:payload,
      almacen:rama(env) === 'main' ? 'SHEET-PRODUCION+R2-MAIN' : 'SHEET-PROBAS+R2-PREVIEW',
      mediosFisicosConservados:true
    });
  } catch (error) {
    return json(502, { ok:false, erro:error?.message || 'Non foi posible eliminar o concerto.' });
  }
}
