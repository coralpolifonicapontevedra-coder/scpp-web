import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const APPS_SCRIPT_PRODUCION = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const APPS_SCRIPT_PREVIEW = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';
const INDEX_MAIN = 'indices/concertos-privado-v1.json';
const INDEX_PREVIEW = 'indices/preview/concertos-privado-v1.json';

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
const esperadoAppsScript = (env) => rama(env) === 'main' ? APPS_SCRIPT_PRODUCION : APPS_SCRIPT_PREVIEW;

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

async function actualizarIndice(env, idConcerto, concerto) {
  const indice = await lerIndice(env);
  if (!indice?.ok || !Array.isArray(indice.concertos)) throw new Error('O índice privado de concertos non está dispoñible.');
  const id = clean(idConcerto);
  const patch = {
    data: canonData(concerto.data), nome: clean(concerto.nome), cidade: clean(concerto.cidade), lugar: clean(concerto.lugar),
    hora: clean(concerto.hora), estado: clean(concerto.estado) || 'Previsto', mostrarWeb: concerto.mostrarWeb === true,
    destacadoWeb: concerto.destacadoWeb === true, caracteristicas: clean(concerto.caracteristicas)
  };
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

    const resultado = await chamarAppsScript(env, user, 'gardarConcertoAdministracionPortal', { concerto: { ...concerto, idConcerto } }, true);
    idConcerto = clean(resultado?.idConcerto || idConcerto);
    if (!idConcerto) throw new Error('Apps Script non devolveu o identificador do concerto.');
    await actualizarIndice(env, idConcerto, concerto);

    return json(200, {
      ok:true,
      nivel:permiso.nivel,
      resultado:{ ...resultado, idConcerto },
      almacen:rama(env) === 'main' ? 'SHEET-PRODUCION+R2-MAIN' : 'SHEET-PROBAS+R2-PREVIEW',
      reutilizado,
      duplicadosDetectados:duplicados,
      fonteDuplicados
    });
  } catch (error) {
    const status = error?.code === 'FORBIDDEN' ? 403 : error?.code === 'NOT_FOUND' ? 404 : 502;
    return json(status, { ok:false, codigo:error?.code || 'UPSTREAM', erro:error?.message || 'Non foi posible gardar o concerto.' });
  }
}
