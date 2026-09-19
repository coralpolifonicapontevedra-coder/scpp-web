import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const APPS_SCRIPT_PRODUCION = 'https://script.google.com/macros/s/AKfycbwxlH1BRoKrmUxSSk_KmtLrhsgToO1OHhw3IBtg8ceqigKxErvkzlS2mHWutv9Wb0OsXA/exec';
const INDEX_MAIN = 'indices/concertos-privado-v1.json';
const INDEX_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const PUBLIC_INDEX_MAIN = 'indices/concertos-v1.json';
const R2_SYNC_ATTEMPTS = 2;

const clean = (value) => String(value ?? '').trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});
const rama = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const indexKey = (env) => rama(env) === 'main' ? INDEX_MAIN : INDEX_PREVIEW;
const esperadoAppsScript = (env) => clean(env.APPS_SCRIPT_WEBAPP_URL);
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const invalidationKey = (env) => `cache/invalidation/${rama(env)}/concertos.json`;

function canon(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
}
function canonData(value) {
  const text = clean(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : text;
}
function canonHora(value) { return clean(value).slice(0, 5); }
function claveConcerto(concerto = {}) {
  return [canonData(concerto.data), canon(concerto.nome), canon(concerto.cidade), canon(concerto.lugar), canonHora(concerto.hora)].join('|');
}
function preferirId(items) {
  return [...items].sort((a, b) => {
    const na = Number(clean(a.idConcerto));
    const nb = Number(clean(b.idConcerto));
    if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
    return clean(b.idConcerto).localeCompare(clean(a.idConcerto));
  })[0] || null;
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
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

async function chamarAppsScript(env, user, accion, datos = {}, senReintento = false) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN, accion, email: user.email, uidFirebase: user.uid, ...datos
  }, { timeoutMs: 25000, attemptTimeoutMs: senReintento ? 25000 : 10000 });
  const payload = resultado?.resultado || resultado;
  if (!resultado?.ok) {
    const error = new Error(resultado?.erro || 'Apps Script non puido completar a operación.');
    error.code = resultado?.codigo || 'APPS_SCRIPT_RESULT';
    throw error;
  }
  return payload;
}

async function lerIndice(env) {
  const object = await env.R2_PRIVADO?.get?.(indexKey(env));
  return object ? object.json().catch(() => null) : null;
}

async function localizarExistente(env, user, concerto) {
  const key = claveConcerto(concerto);
  const indice = await lerIndice(env);
  if (indice?.ok && Array.isArray(indice.concertos)) {
    const coincidencias = indice.concertos
      .map((item) => ({ ...item, idConcerto: clean(item?.id || item?.idConcerto) }))
      .filter((item) => item.idConcerto && !item.idConcerto.startsWith('hist-') && claveConcerto(item) === key);
    return { existente: preferirId(coincidencias), duplicados: coincidencias.map((item) => clean(item.idConcerto)), fonte: 'R2' };
  }

  const payload = await chamarAppsScript(env, user, 'listarConcertosAdministracionPortal');
  const concertos = Array.isArray(payload?.concertos) ? payload.concertos : [];
  const coincidencias = concertos.filter((item) => {
    const id = clean(item?.idConcerto);
    return id && !id.startsWith('hist-') && claveConcerto(item) === key;
  });
  return { existente: preferirId(coincidencias), duplicados: coincidencias.map((item) => clean(item.idConcerto)), fonte: 'SHEET-RECOVERY' };
}

function patchConcerto(concerto) {
  return {
    data: canonData(concerto.data), nome: clean(concerto.nome), cidade: clean(concerto.cidade), lugar: clean(concerto.lugar),
    hora: clean(concerto.hora), estado: clean(concerto.estado) || 'Previsto', mostrarWeb: concerto.mostrarWeb === true,
    destacadoWeb: concerto.destacadoWeb === true, caracteristicas: clean(concerto.caracteristicas)
  };
}

async function actualizarIndice(env, idConcerto, concerto) {
  const indice = await lerIndice(env);
  if (!indice?.ok || !Array.isArray(indice.concertos)) throw new Error('O índice privado de concertos non está dispoñible.');
  const id = clean(idConcerto);
  const patch = patchConcerto(concerto);
  let found = false;
  const concertos = indice.concertos.map((item) => {
    if (clean(item?.id) !== id) return item;
    found = true;
    return { ...item, ...patch };
  });
  if (!found) concertos.push({ id, programa: [], ...patch });
  await env.R2_PRIVADO.put(indexKey(env), JSON.stringify({
    ...indice, concertos, xeradoEn: new Date().toISOString(), xeradoEnMs: Date.now(), actualizadoDesde: 'ADMIN-CONCERTOS-GARDAR'
  }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } });
  await env.R2_PRIVADO.put(
    invalidationKey(env),
    JSON.stringify({ updatedAt: Date.now(), source: 'admin-concertos-gardar' }),
    { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } }
  ).catch(() => {});
}

async function actualizarIndicePublico(env, idConcerto, concerto) {
  if (rama(env) !== 'main' || !env.R2_PUBLICO) return { ok:true, omitido:true };
  const object = await env.R2_PUBLICO.get(PUBLIC_INDEX_MAIN);
  const indice = object ? await object.json().catch(() => null) : null;
  if (!indice?.ok || !Array.isArray(indice.concertos)) throw new Error('O índice público de concertos non está dispoñible.');

  const id = clean(idConcerto);
  const patch = patchConcerto(concerto);
  const existentes = indice.concertos.filter((item) => clean(item?.id) !== id);
  if (patch.mostrarWeb) {
    const previo = indice.concertos.find((item) => clean(item?.id) === id) || {};
    existentes.push({ ...previo, id, programa:Array.isArray(previo.programa) ? previo.programa : [], ...patch });
  }
  existentes.sort((a, b) => canonData(a.data).localeCompare(canonData(b.data)) || clean(a.id).localeCompare(clean(b.id)));

  await env.R2_PUBLICO.put(PUBLIC_INDEX_MAIN, JSON.stringify({
    ...indice,
    concertos:existentes,
    total:existentes.length,
    xeradoEn:new Date().toISOString(),
    xeradoEnMs:Date.now(),
    actualizadoDesde:'ADMIN-CONCERTOS-GARDAR'
  }), { httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'no-store' } });
  return { ok:true, omitido:false };
}

async function actualizarIndiceConReintento(env, idConcerto, concerto) {
  let ultimoErro = null;
  for (let intento = 1; intento <= R2_SYNC_ATTEMPTS; intento += 1) {
    try {
      await actualizarIndice(env, idConcerto, concerto);
      await actualizarIndicePublico(env, idConcerto, concerto);
      return { ok:true, intentos:intento };
    } catch (error) {
      ultimoErro = error;
      if (intento < R2_SYNC_ATTEMPTS) await pausa(150 * intento);
    }
  }

  return {
    ok:false,
    intentos:R2_SYNC_ATTEMPTS,
    codigo:ultimoErro?.code || 'R2_SYNC_FAILED',
    erro:ultimoErro?.message || 'Non foi posible actualizar o índice R2.'
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (clean(env.APPS_SCRIPT_WEBAPP_URL) !== esperadoAppsScript(env)) return json(409, { ok:false, erro:`O contorno ${rama(env)} non está conectado ao Apps Script esperado.` });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok:false, erro:'O servizo non está configurado correctamente.' });

  const body = await request.json().catch(() => null);
  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });

  const permiso = await permisoConcertos(env, user).catch(() => null);
  if (!permiso?.podeEscribir) return json(403, { ok:false, erro:'Non tes permiso de escritura no módulo Concertos.' });

  const concerto = body?.concerto || {};
  if (!canonData(concerto.data) || !clean(concerto.nome)) return json(400, { ok:false, erro:'A data e o nome son obrigatorios.' });

  const inicioTotal = Date.now();
  try {
    let idConcerto = clean(concerto.idConcerto);
    let reutilizado = false;
    let duplicados = [];
    let fonteDuplicados = 'NON-APLICA';
    if (!idConcerto) {
      const localizado = await localizarExistente(env, user, concerto);
      duplicados = localizado.duplicados;
      fonteDuplicados = localizado.fonte;
      if (localizado.existente) {
        idConcerto = clean(localizado.existente.idConcerto);
        reutilizado = true;
      }
    }

    const inicioAppsScript = Date.now();
    let resultado;
    try {
      resultado = await chamarAppsScript(env, user, 'gardarConcertoAdministracionPortal', { concerto: { ...concerto, idConcerto } }, true);
    } catch (error) {
      const status = error?.code === 'FORBIDDEN' ? 403 : error?.code === 'NOT_FOUND' ? 404 : 502;
      return json(status, {
        ok:false, etapa:'APPS_SCRIPT', codigo:error?.code || 'UPSTREAM',
        erro:error?.message || 'Non foi posible gardar o concerto.',
        tempos:{ appsScriptMs:Date.now() - inicioAppsScript, totalMs:Date.now() - inicioTotal }
      });
    }

    const appsScriptMs = Date.now() - inicioAppsScript;
    idConcerto = clean(resultado?.idConcerto || idConcerto);
    if (!idConcerto) {
      return json(502, {
        ok:false, etapa:'APPS_SCRIPT', codigo:'MISSING_CONCERT_ID',
        erro:'Apps Script non devolveu o identificador do concerto.',
        tempos:{ appsScriptMs, totalMs:Date.now() - inicioTotal }
      });
    }

    const inicioR2 = Date.now();
    const sincronizacionR2 = await actualizarIndiceConReintento(env, idConcerto, concerto);
    const r2Ms = Date.now() - inicioR2;
    if (!sincronizacionR2.ok) {
      console.warn('O concerto gardouse na Sheet pero fallou a sincronización R2.', {
        idConcerto, codigo:sincronizacionR2.codigo, erro:sincronizacionR2.erro, intentos:sincronizacionR2.intentos
      });
    }

    const almacenSheet = rama(env) === 'main' ? 'SHEET-PRODUCION' : 'SHEET-PROBAS';
    return json(200, {
      ok:true,
      nivel:permiso.nivel,
      resultado:{ ...resultado, idConcerto },
      almacen:sincronizacionR2.ok
        ? `${almacenSheet}+${rama(env) === 'main' ? 'R2-MAIN' : 'R2-PREVIEW'}`
        : almacenSheet,
      sincronizacionR2,
      aviso:sincronizacionR2.ok
        ? null
        : 'O concerto quedou gardado na folla de datos, pero o índice rápido non se puido actualizar neste intento.',
      reutilizado,
      duplicadosDetectados:duplicados,
      fonteDuplicados,
      tempos:{ appsScriptMs, r2Ms, totalMs:Date.now() - inicioTotal }
    });
  } catch (error) {
    return json(502, {
      ok:false, etapa:'PREPARACION', codigo:error?.code || 'UPSTREAM',
      erro:error?.message || 'Non foi posible preparar o gardado do concerto.',
      tempos:{ totalMs:Date.now() - inicioTotal }
    });
  }
}
