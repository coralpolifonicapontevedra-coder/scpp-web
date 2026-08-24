import { obterJsonAppsScript } from '../_lib/apps-script.js';

const PREVIEW_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const INDEX_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json';

const clean = (value) => String(value ?? '').trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

function canon(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function canonData(value) {
  const text = clean(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : text;
}

function canonHora(value) {
  return clean(value).slice(0, 5);
}

function claveConcerto(concerto = {}) {
  return [
    canonData(concerto.data),
    canon(concerto.nome),
    canon(concerto.cidade),
    canon(concerto.lugar),
    canonHora(concerto.hora)
  ].join('|');
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  return { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
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

async function chamarAppsScript(env, user, accion, datos = {}, senReintento = false) {
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
      timeoutMs: 25_000,
      attemptTimeoutMs: senReintento ? 25_000 : 10_000
    }
  );
  const payload = resultado?.resultado || resultado;
  if (!resultado?.ok) {
    const error = new Error(resultado?.erro || 'Apps Script non puido completar a operación.');
    error.code = resultado?.codigo || 'APPS_SCRIPT_RESULT';
    throw error;
  }
  return payload;
}

async function localizarExistente(env, user, concerto) {
  const payload = await chamarAppsScript(env, user, 'listarConcertosAdministracionPortal');
  const concertos = Array.isArray(payload?.concertos) ? payload.concertos : [];
  const key = claveConcerto(concerto);
  const coincidencias = concertos.filter((item) => {
    const id = clean(item?.idConcerto);
    return id && !id.startsWith('hist-') && claveConcerto(item) === key;
  });
  return { existente: preferirId(coincidencias), duplicados: coincidencias.map((item) => clean(item.idConcerto)) };
}

async function lerIndice(env) {
  const object = await env.R2_PRIVADO?.get?.(INDEX_KEY_PREVIEW);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function actualizarIndice(env, idConcerto, concerto) {
  if (!env.R2_PRIVADO) throw new Error('R2 privado non está configurado.');
  const indice = await lerIndice(env);
  if (!indice?.ok || !Array.isArray(indice.concertos)) {
    throw new Error('O índice privado de concertos de Preview non está dispoñible.');
  }

  const id = clean(idConcerto);
  const patch = {
    data: canonData(concerto.data),
    nome: clean(concerto.nome),
    cidade: clean(concerto.cidade),
    lugar: clean(concerto.lugar),
    hora: clean(concerto.hora),
    estado: clean(concerto.estado) || 'Previsto',
    mostrarWeb: concerto.mostrarWeb === true,
    destacadoWeb: concerto.destacadoWeb === true,
    caracteristicas: clean(concerto.caracteristicas)
  };

  let found = false;
  const concertos = indice.concertos.map((item) => {
    if (clean(item?.id) !== id) return item;
    found = true;
    return { ...item, ...patch };
  });
  if (!found) concertos.push({ id, programa: [], ...patch });

  await env.R2_PRIVADO.put(INDEX_KEY_PREVIEW, JSON.stringify({
    ...indice,
    concertos,
    xeradoEn: new Date().toISOString(),
    xeradoEnMs: Date.now(),
    actualizadoDesde: 'ADMIN-CONCERTOS-ALTA-IDEMPOTENTE'
  }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (clean(env.CF_PAGES_BRANCH) === 'main') return json(403, { ok: false, erro: 'Este endpoint é exclusivo de Preview.' });
  if (clean(env.APPS_SCRIPT_WEBAPP_URL) !== PREVIEW_APPS_SCRIPT_URL) {
    return json(500, { ok: false, erro: 'Preview non está conectado ao Apps Script de probas esperado.' });
  }
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo de Preview non está configurado correctamente.' });
  }

  const body = await request.json().catch(() => null);
  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user))) return json(403, { ok: false, erro: 'Usuario non autorizado para Administración.' });

  const concerto = body?.concerto || {};
  if (!canonData(concerto.data) || !clean(concerto.nome)) {
    return json(400, { ok: false, erro: 'A data e o nome son obrigatorios.' });
  }

  try {
    let idConcerto = clean(concerto.idConcerto);
    let reutilizado = false;
    let duplicados = [];

    if (!idConcerto) {
      const localizado = await localizarExistente(env, user, concerto);
      duplicados = localizado.duplicados;
      if (localizado.existente) {
        idConcerto = clean(localizado.existente.idConcerto);
        reutilizado = true;
      }
    }

    const entrada = { ...concerto, idConcerto };
    const resultado = await chamarAppsScript(
      env,
      user,
      'gardarConcertoAdministracionPortal',
      { concerto: entrada },
      true
    );

    idConcerto = clean(resultado?.idConcerto || idConcerto);
    if (!idConcerto) throw new Error('Apps Script non devolveu o identificador do concerto.');

    await actualizarIndice(env, idConcerto, concerto);

    return json(200, {
      ok: true,
      resultado: { ...resultado, idConcerto },
      almacen: 'SHEET-PROBAS+R2-PREVIEW',
      reutilizado,
      duplicadosDetectados: duplicados
    });
  } catch (error) {
    const status = error?.code === 'FORBIDDEN' ? 403 : error?.code === 'NOT_FOUND' ? 404 : 502;
    return json(status, { ok: false, codigo: error?.code || 'UPSTREAM', erro: error?.message || 'Non foi posible gardar o concerto.' });
  }
}
