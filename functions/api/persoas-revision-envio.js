const TOKEN_PREFIX = 'persoas/revisions/';
const TIMEOUT_FIREBASE_MS = 8000;
const TIMEOUT_APPS_SCRIPT_MS = 30000;
const MAX_ENVIOS = 100;
const PRODUCTION_HOSTS = new Set([
  'coralpolifonicapontevedra.org',
  'www.coralpolifonicapontevedra.org'
]);

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
  try { return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: String(user.localId || ''), email: String(user.email).trim().toLowerCase() };
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

function eHostProduccion(hostname) {
  return PRODUCTION_HOSTS.has(String(hostname || '').trim().toLowerCase());
}

function emailValido(value) {
  const correo = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : '';
}

function tokenDesdeLigazon(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !eHostProduccion(url.hostname)) return null;
    if (url.pathname !== '/revision-datos/' && url.pathname !== '/revision-datos') return null;
    const token = String(url.searchParams.get('token') || '').trim();
    if (!/^[A-Za-z0-9_-]{30,160}$/.test(token)) return null;
    return { token, ligazon: url.toString() };
  } catch { return null; }
}

async function verificarAdministrador(context, data) {
  const user = await verificarFirebase(data.idToken, context.env.FIREBASE_API_KEY);
  if (!user) throw Object.assign(new Error('A sesión administrativa non é válida.'), { status: 401 });
  const listado = await chamarAppsScript(context.env, {
    accion: 'listarPersoasAdministracion',
    email: user.email,
    uidFirebase: user.uid
  });
  if (listado?.perfil?.nivel !== 'Administración') throw Object.assign(new Error('Non tes permiso de Administración.'), { status: 403 });
  return user;
}

async function cargarInvitacion(env, token) {
  const object = await env.R2_PRIVADO?.get?.(`${TOKEN_PREFIX}${token}.json`);
  if (!object) return null;
  try { return await object.json(); } catch { return null; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestUrl = new URL(request.url);

  // Seguro principal: o endpoint de envío non funciona en Preview, pages.dev nin localhost.
  if (!eHostProduccion(requestUrl.hostname)) {
    return json(403, {
      ok: false,
      bloqueado: true,
      erro: 'O envío real de correos está bloqueado fóra de Produción.'
    });
  }

  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'Falta configuración do servizo.' });
  }

  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  let user;
  try { user = await verificarAdministrador(context, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error.message }); }

  const ligazons = Array.isArray(data.ligazons) ? data.ligazons : [];
  if (!ligazons.length) return json(400, { ok: false, erro: 'Non se indicaron ligazóns para enviar.' });
  if (ligazons.length > MAX_ENVIOS) return json(400, { ok: false, erro: `Máximo ${MAX_ENVIOS} envíos por operación.` });

  const envios = [];
  const omitidos = [];
  const vistos = new Set();
  const agora = Date.now();

  for (const value of ligazons) {
    const parsed = tokenDesdeLigazon(value);
    if (!parsed) {
      omitidos.push({ motivo: 'Ligazón non válida ou non pertencente a Produción' });
      continue;
    }
    if (vistos.has(parsed.token)) {
      omitidos.push({ motivo: 'Ligazón duplicada na mesma operación' });
      continue;
    }
    vistos.add(parsed.token);

    const invitation = await cargarInvitacion(env, parsed.token);
    if (!invitation) {
      omitidos.push({ motivo: 'A revisión xa non existe ou non está dispoñible' });
      continue;
    }
    if (String(invitation.estado || '') !== 'PENDENTE') {
      omitidos.push({ idPersoa: invitation.idPersoa, nome: invitation?.persoa?.nomeCompleto, motivo: 'A revisión xa non está pendente' });
      continue;
    }
    if (Date.parse(invitation.caducaEn || '') <= agora) {
      omitidos.push({ idPersoa: invitation.idPersoa, nome: invitation?.persoa?.nomeCompleto, motivo: 'A revisión está caducada' });
      continue;
    }
    if (String(invitation.xeracion || '') !== 'MASIVA') {
      omitidos.push({ idPersoa: invitation.idPersoa, nome: invitation?.persoa?.nomeCompleto, motivo: 'A revisión non procede dunha xeración masiva' });
      continue;
    }

    const correo = emailValido(invitation?.persoa?.correo);
    const revisionId = String(invitation.revisionId || '').trim();
    const idPersoa = String(invitation.idPersoa || '').trim();
    if (!correo || !revisionId || !idPersoa) {
      omitidos.push({ idPersoa, nome: invitation?.persoa?.nomeCompleto, motivo: 'A revisión non ten datos suficientes para o envío' });
      continue;
    }

    envios.push({
      revisionId,
      idPersoa,
      nome: String(invitation?.persoa?.nomeCompleto || '').trim() || idPersoa,
      correo,
      ligazon: parsed.ligazon,
      caducaEn: String(invitation.caducaEn || ''),
      versionLegal: String(invitation?.textoLegal?.version || '').trim()
    });
  }

  if (!envios.length) {
    return json(400, { ok: false, erro: 'Non hai ningunha revisión válida para enviar.', omitidos });
  }

  let resultado;
  try {
    resultado = await chamarAppsScript(env, {
      accion: 'enviarRevisionsPersoasAdministracion',
      email: user.email,
      uidFirebase: user.uid,
      envios
    });
  } catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible realizar o envío.' });
  }

  return json(200, {
    ok: true,
    solicitados: ligazons.length,
    validados: envios.length,
    omitidosPrevios: omitidos,
    envio: resultado
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  return onRequestPost(context);
}
