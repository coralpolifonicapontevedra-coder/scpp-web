import { obterJsonAppsScript } from '../_lib/apps-script.js';

const LEGAL_ID = 'EXENCION_COTA_SCPP';
const R2_KEY = 'persoas/textos-legais/EXENCION_COTA_SCPP.json';
const REVIEW_PREFIX = 'persoas/revisions/';
const TIMEOUT_FIREBASE_MS = 8000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
});

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
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

function validarTexto(value) {
  const item = value && typeof value === 'object' ? value : null;
  if (!item) return null;
  const texto = {
    id: String(item.id || '').trim(),
    version: String(item.version || '').trim(),
    titulo: String(item.titulo || '').trim(),
    texto: String(item.texto || '').trim(),
    ambito: String(item.ambito || '').trim(),
    dataVixencia: String(item.dataVixencia || '').trim()
  };
  if (texto.id !== LEGAL_ID || !texto.version || !texto.titulo || !texto.texto) return null;
  return texto;
}

async function gardarR2(env, texto) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') {
    throw new Error('R2 privado non está dispoñible.');
  }
  await env.R2_PRIVADO.put(
    R2_KEY,
    JSON.stringify({ gardadoEn: new Date().toISOString(), entorno: 'PREVIEW', texto }),
    { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } }
  );
}

async function lerR2(env) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(R2_KEY);
  if (!object) return null;
  try { return validarTexto((await object.json())?.texto); }
  catch { return null; }
}

function tokenValido(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : '';
}

async function revisionValida(env, token) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return false;
  const object = await env.R2_PRIVADO.get(`${REVIEW_PREFIX}${token}.json`);
  if (!object) return false;
  try {
    const revision = await object.json();
    return revision?.token === token &&
      revision?.estado === 'PENDENTE' &&
      Date.parse(String(revision?.caducaEn || '')) > Date.now();
  } catch {
    return false;
  }
}

async function cargarDesdeSheet(env, user) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'obterTextoLegalPersoasAdministracion',
    email: user.email,
    uidFirebase: user.uid
  }, { timeoutMs: 20000, attemptTimeoutMs: 10000 });

  if (!resultado?.ok) throw new Error(resultado?.erro || 'Apps Script non devolveu os textos de Persoas.');
  const texto = validarTexto(resultado.textoExencionCota);
  if (!texto) throw new Error('O texto de exención da cota non está dispoñible na Sheet de Preview.');
  await gardarR2(env, texto);
  return texto;
}

export async function onRequest({ request, env }) {
  if (request.method === 'POST') {
    let data;
    try { data = await request.json(); }
    catch { return json(400, { ok: false, erro: 'Petición non válida.' }); }

    const user = await verificarFirebase(data?.idToken, env.FIREBASE_API_KEY);
    if (!user) return json(401, { ok: false, erro: 'Sesión non válida.' });
    if (!env.WEB_WRITE_TOKEN) return json(500, { ok: false, erro: 'Falta a configuración de Apps Script.' });

    try {
      const texto = await cargarDesdeSheet(env, user);
      return json(200, { ok: true, textoExencionCota: texto, fonte: 'SHEET+R2', entorno: 'PREVIEW' });
    } catch (error) {
      return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible cargar o texto.' });
    }
  }

  if (request.method === 'GET') {
    const token = tokenValido(new URL(request.url).searchParams.get('token'));
    if (!token) return json(400, { ok: false, erro: 'A ligazón de revisión non é válida.' });
    if (!(await revisionValida(env, token))) return json(404, { ok: false, erro: 'A revisión non existe, caducou ou xa foi completada.' });

    const texto = await lerR2(env);
    if (!texto) return json(503, { ok: false, erro: 'O texto de exención da cota aínda non está preparado en R2.' });
    return json(200, { ok: true, textoExencionCota: texto, fonte: 'R2', entorno: 'PREVIEW' });
  }

  return json(405, { ok: false, erro: 'Método non permitido.' });
}
