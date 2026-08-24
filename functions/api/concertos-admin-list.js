import { obterJsonAppsScript } from '../_lib/apps-script.js';

const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const PREVIEW_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';

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

function verificarEntornoPreview(env) {
  const rama = clean(env.CF_PAGES_BRANCH);
  const urlAppsScript = clean(env.APPS_SCRIPT_WEBAPP_URL);
  if (rama === 'main') {
    throw new Error('Este endpoint é exclusivo de Preview e non pode executarse en main.');
  }
  if (urlAppsScript !== PREVIEW_APPS_SCRIPT_URL) {
    throw new Error('Preview non está conectado ao Apps Script de probas. Operación cancelada por seguridade.');
  }
}

async function listarDesdeSheetProbas(env, user) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarConcertosAdministracionPortal',
    email: user.email,
    uidFirebase: user.uid
  }, { timeoutMs: 20000, attemptTimeoutMs: 8000 });

  const payload = resultado?.resultado || resultado;
  if (!payload?.ok || !Array.isArray(payload?.concertos)) {
    throw new Error(payload?.erro || 'Non foi posible ler os concertos da Sheet de probas.');
  }
  return payload;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'O servizo non está configurado.' });

  try {
    verificarEntornoPreview(env);
  } catch (error) {
    return json(409, { ok: false, erro: error?.message || 'Entorno de Preview non válido.' });
  }

  const body = await request.json().catch(() => null);
  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user))) return json(403, { ok: false, erro: 'Usuario non autorizado para Administración.' });

  try {
    const payload = await listarDesdeSheetProbas(env, user);
    return json(200, {
      ok: true,
      nivel: payload.nivel || 'Administración',
      concertos: payload.concertos,
      almacen: 'SHEET-PROBAS',
      fonte: 'CONCERTOS_SPREADSHEET_ID-PREVIEW'
    });
  } catch (error) {
    return json(502, { ok: false, erro: error?.message || 'Non foi posible listar os concertos da Sheet de probas.' });
  }
}
