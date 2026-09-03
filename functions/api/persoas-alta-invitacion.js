import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

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
  const token = String(idToken || '').trim();
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
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: String(user.localId || ''), email: String(user.email).trim().toLowerCase() };
}

async function chamarAppsScript(env, body) {
  const { resultado } = await obterJsonAppsScript(env, body, {
    timeoutMs: 30000,
    attemptTimeoutMs: 12000
  });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Apps Script non completou a operación.');
  return resultado;
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function eTimeout(error) {
  return error instanceof Error && (
    error.name === 'AbortError' ||
    error.code === 'APPS_SCRIPT_TIMEOUT' ||
    /aborted|timeout|tardou demasiado/i.test(error.message)
  );
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) return json(500, { ok: false, erro: 'Falta configuración do servizo.' });

  let data;
  try { data = await request.json(); } catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  const user = await verificarFirebase(data.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión administrativa non é válida.' });

  const nome = clean(data.nome, 100);
  const correo = clean(data.correo, 160).toLowerCase();
  const telefono = clean(data.telefono, 40);
  if (!nome || !correo || !telefono) return json(400, { ok: false, erro: 'Nome, correo e teléfono son obrigatorios.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return json(400, { ok: false, erro: 'O correo electrónico non é válido.' });

  try {
    const result = await chamarAppsScript(env, {
      accion: 'crearPersoaInvitacionAdministracion',
      email: user.email,
      uidFirebase: user.uid,
      nome,
      correo,
      telefono
    });
    return json(200, {
      ok: true,
      idPersoa: String(result.idPersoa || ''),
      rowId: String(result.rowId || ''),
      estadoAlta: String(result.estadoAlta || 'PENDENTE')
    });
  } catch (error) {
    const timeout = eTimeout(error);
    return json(timeout ? 504 : 400, {
      ok: false,
      erro: timeout
        ? 'Apps Script tardou demasiado en responder. Inténtao de novo.'
        : (error instanceof Error ? error.message : 'Non foi posible crear a alta por invitación.')
    });
  }
}
