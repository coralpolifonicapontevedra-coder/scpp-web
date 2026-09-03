const TOKEN_PREFIX = 'persoas/revisions/';
const TIMEOUT_APPS_SCRIPT_MS = 15000;

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
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function tokenValido(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : '';
}

function urlAppsScriptPrincipal(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) ? url : '';
}

async function chamarAppsScript(env, body) {
  const url = urlAppsScriptPrincipal(env);
  if (!url || !env.WEB_WRITE_TOKEN) throw new Error('Apps Script non está configurado.');
  const response = await fetchConLimite(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: env.WEB_WRITE_TOKEN, ...body })
  }, TIMEOUT_APPS_SCRIPT_MS);
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('Apps Script devolveu unha resposta non válida.'); }
  if (!response.ok || !result?.ok) throw new Error(result?.erro || `Apps Script respondeu HTTP ${response.status}.`);
  return result;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return json(503, { ok: false, erro: 'R2 privado non está dispoñible.' });

  let data;
  try { data = await request.json(); } catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }
  const token = tokenValido(data.token);
  if (!token) return json(400, { ok: false, erro: 'Falta unha ligazón de revisión válida.' });

  const object = await env.R2_PRIVADO.get(`${TOKEN_PREFIX}${token}.json`);
  if (!object) return json(404, { ok: false, erro: 'A revisión non existe.' });
  const invitation = await object.json().catch(() => null);
  if (!invitation?.idPersoa || !invitation?.administrador) return json(400, { ok: false, erro: 'A revisión non contén os datos necesarios.' });
  if (invitation.estado !== 'COMPLETADA') return json(409, { ok: false, erro: 'A revisión aínda non foi completada.' });

  try {
    const result = await chamarAppsScript(env, {
      accion: 'completarAltaPersoaAdministracion',
      email: String(invitation.administrador).trim().toLowerCase(),
      idPersoa: String(invitation.idPersoa),
      id: String(invitation.idPersoa)
    });
    return json(200, {
      ok: true,
      idPersoa: String(result.idPersoa || invitation.idPersoa),
      estadoAlta: String(result.estadoAlta || 'COMPLETA'),
      existente: result.existente === true
    });
  } catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible completar o estado da alta.' });
  }
}
