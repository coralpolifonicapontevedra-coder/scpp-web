import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const APPS_SCRIPT_PRODUCION = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const APPS_SCRIPT_PREVIEW = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';

const clean = (value) => String(value || '').trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const rama = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const esperadoAppsScript = (env) => rama(env) === 'main' ? APPS_SCRIPT_PRODUCION : APPS_SCRIPT_PREVIEW;

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

function verificarEntorno(env) {
  if (clean(env.APPS_SCRIPT_WEBAPP_URL) !== esperadoAppsScript(env)) {
    throw new Error(`O contorno ${rama(env)} non está conectado ao Apps Script esperado. Operación cancelada por seguridade.`);
  }
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

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok:false, erro:'O servizo non está configurado.' });

  try { verificarEntorno(env); }
  catch (error) { return json(409, { ok:false, erro:error?.message || 'Contorno non válido.' }); }

  const body = await request.json().catch(() => null);
  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });

  const permiso = await permisoConcertos(env, user).catch(() => null);
  if (!permiso?.podeLer) return json(403, { ok:false, erro:'Non tes permiso de lectura no módulo Concertos.' });

  try {
    const payload = await listarDesdeSheet(env, user);
    return json(200, {
      ok:true,
      nivel:permiso.nivel,
      permiso,
      concertos:payload.concertos,
      almacen:rama(env) === 'main' ? 'SHEET-PRODUCION' : 'SHEET-PROBAS',
      fonte:rama(env) === 'main' ? 'CONCERTOS_SPREADSHEET_ID-MAIN' : 'CONCERTOS_SPREADSHEET_ID-PREVIEW'
    });
  } catch (error) {
    return json(502, { ok:false, erro:error?.message || 'Non foi posible listar os concertos da Sheet.' });
  }
}
