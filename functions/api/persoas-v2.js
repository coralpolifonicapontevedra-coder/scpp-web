const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

const TIMEOUT_FIREBASE_MS = 8000;
const TIMEOUT_APPS_SCRIPT_MS = 15000;

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
  if (!token) return null;
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
  return {
    uid: String(user.localId || ''),
    email: String(user.email).trim().toLowerCase()
  };
}

function urlAppsScriptPrincipal(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url)
    ? url
    : '';
}

async function chamarAppsScriptPrincipal(env, body) {
  const url = urlAppsScriptPrincipal(env);
  if (!url) {
    const error = new Error('Non está configurada a implementación principal de Apps Script.');
    error.code = 'APPS_SCRIPT_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetchConLimite(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    },
    TIMEOUT_APPS_SCRIPT_MS
  );

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    const error = new Error('Apps Script devolveu unha resposta non válida.');
    error.code = 'APPS_SCRIPT_INVALID_RESPONSE';
    error.detail = text.slice(0, 180);
    throw error;
  }

  if (!response.ok) {
    const error = new Error(result?.erro || `Apps Script respondeu HTTP ${response.status}.`);
    error.code = 'APPS_SCRIPT_HTTP_ERROR';
    throw error;
  }
  return result;
}

function claveR2Valida(value) {
  const key = String(value || '').trim().replace(/^\/+/, '');
  if (!key || key.includes('..') || key.includes('\\')) return '';
  return key.startsWith('persoas/fichas/') ? key : '';
}

async function servirFicha(env, result) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') {
    return json(503, { ok: false, etapa: 'R2_BINDING', erro: 'R2_PRIVADO non está dispoñible nesta implementación.' });
  }

  const key = claveR2Valida(result?.r2Key);
  if (!key) {
    return json(400, { ok: false, etapa: 'R2_KEY', erro: 'A clave R2 devolta por Apps Script non é válida.' });
  }

  const object = await env.R2_PRIVADO.get(key);
  if (!object) {
    return json(404, { ok: false, etapa: 'R2_OBJECT', erro: `Non se atopou o obxecto ${key} en R2.` });
  }

  const name = String(result?.nomeFicheiro || key.split('/').pop() || 'ficha.pdf')
    .replace(/[\r\n"]/g, '');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${name}"`);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Storage', 'R2');
  headers.set('X-SCPP-Persoas-Version', 'v2');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, etapa: 'REQUEST', erro: 'Método non permitido.' });
  }
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, etapa: 'CONFIG', erro: 'Faltan variables obrigatorias do servizo.' });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json(400, { ok: false, etapa: 'REQUEST', erro: 'Solicitude JSON non válida.' });
  }

  let user;
  try {
    user = await verificarFirebase(data.idToken, env.FIREBASE_API_KEY);
  } catch (error) {
    return json(503, { ok: false, etapa: 'FIREBASE', erro: error instanceof Error ? error.message : 'Fallou Firebase.' });
  }
  if (!user) {
    return json(401, { ok: false, etapa: 'AUTH', erro: 'A identificación non é válida ou caducou.' });
  }

  const action = String(data.accion || 'listarPersoasAdministracion').trim();
  if (!['listarPersoasAdministracion', 'obterFichaPersoaAdministracion'].includes(action)) {
    return json(400, { ok: false, etapa: 'ACTION', erro: 'Acción non permitida.' });
  }

  const idPersoa = String(data.idPersoa || data.id || '').trim();
  const body = {
    token: env.WEB_WRITE_TOKEN,
    accion: action,
    email: user.email,
    uidFirebase: user.uid,
    idPersoa,
    id: idPersoa
  };

  let result;
  try {
    result = await chamarAppsScriptPrincipal(env, body);
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError';
    return json(timeout ? 504 : 503, {
      ok: false,
      etapa: 'APPS_SCRIPT',
      codigo: error?.code || (timeout ? 'TIMEOUT' : 'UNAVAILABLE'),
      erro: timeout
        ? 'A implementación principal de Apps Script tardou demasiado en responder.'
        : (error instanceof Error ? error.message : 'Fallou Apps Script.')
    });
  }

  if (!result?.ok) {
    const forbidden = result?.erro === 'Usuario non autorizado';
    return json(forbidden ? 403 : 400, {
      ok: false,
      etapa: 'APPS_SCRIPT_RESULT',
      erro: result?.erro || 'Apps Script non completou a operación.'
    });
  }

  if (action === 'obterFichaPersoaAdministracion') {
    return servirFicha(env, result);
  }

  return json(200, {
    ok: true,
    version: 'persoas-v2',
    perfil: result.perfil,
    persoas: Array.isArray(result.persoas) ? result.persoas : []
  }, {
    'X-SCPP-Persoas-Version': 'v2'
  });
}
