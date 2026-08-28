const CACHE_TOKEN_MS = 5 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8000;
const TIMEOUT_APPS_SCRIPT_MS = 20000;
const cacheTokens = new Map();

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
  if (!token) return null;
  const cached = cacheTokens.get(token);
  if (cached && cached.expira > Date.now()) return cached.usuario;

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
  const usuario = { uid: String(user.localId || ''), email: String(user.email).trim().toLowerCase() };
  cacheTokens.set(token, { usuario, expira: Date.now() + CACHE_TOKEN_MS });
  while (cacheTokens.size > 100) cacheTokens.delete(cacheTokens.keys().next().value);
  return usuario;
}

function appsScriptUrl(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) ? url : '';
}

async function chamarAppsScript(env, body) {
  const url = appsScriptUrl(env);
  if (!url) throw new Error('Non está configurado Apps Script.');
  const response = await fetchConLimite(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  }, TIMEOUT_APPS_SCRIPT_MS);
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); }
  catch { throw new Error('Apps Script devolveu unha resposta non válida.'); }
  if (!response.ok) throw new Error(result?.erro || `Apps Script respondeu HTTP ${response.status}.`);
  return result;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'Firebase non está configurado.' });

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  let usuario;
  try { usuario = await verificarFirebase(datos.idToken, env.FIREBASE_API_KEY); }
  catch (error) { console.error('Erro Firebase sincronización:', error); }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || 'listarSincronizacionPartiturasPortal').trim();
  const permitidas = [
    'listarSincronizacionPartiturasPortal',
    'gardarSincronizacionPartiturasPortal',
    'eliminarSincronizacionPartiturasPortal'
  ];
  if (!permitidas.includes(accion)) return json(400, { ok: false, erro: 'Acción non permitida' });

  try {
    const result = await chamarAppsScript(env, {
      ...datos,
      idToken: undefined,
      token: env.WEB_WRITE_TOKEN,
      accion,
      email: usuario.email,
      correo: usuario.email
    });
    if (!result?.ok) {
      const status = result?.codigo === 'FORBIDDEN' ? 403 : result?.codigo === 'NOT_FOUND' ? 404 : 400;
      return json(status, result || { ok: false, erro: 'Operación non completada' });
    }
    return json(200, result);
  } catch (error) {
    console.error('Erro API sincronización:', error);
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible completar a operación.' });
  }
}
