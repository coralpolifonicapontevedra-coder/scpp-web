import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';
import { obterPermisoPortal } from '../_lib/portal-permissions.js';

const TOKEN_PREFIX = 'persoas/revisions/';
const TIMEOUT_FIREBASE_MS = 8000;
const MAX_ENVIOS = 100;
const PRODUCTION_HOSTS = new Set([
  'coralpolifonicapontevedra.org',
  'www.coralpolifonicapontevedra.org'
]);

const clean = (value) => String(value ?? '').trim();

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
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}

async function verificarAdministrador(context, data) {
  const user = await verificarFirebase(data.idToken, context.env.FIREBASE_API_KEY);
  if (!user) throw Object.assign(new Error('A sesión administrativa non é válida.'), { status: 401 });
  const permiso = await obterPermisoPortal(context.env, user, 'persoas');
  if (!permiso?.podeAdministrar) {
    throw Object.assign(new Error('Non tes permiso de Administración no módulo Persoas.'), { status: 403 });
  }
  return { user, permiso };
}

async function enviarAppsScript(env, user, envios) {
  if (!env.WEB_WRITE_TOKEN) throw new Error('Apps Script non está configurado.');
  const { resultado } = await obterJsonAppsScriptPersoas(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'enviarRevisionsPersoasAdministracion',
    email: user.email,
    actorEmail: user.email,
    uidFirebase: user.uid,
    autorizadoR2: true,
    envios
  }, { timeoutMs: 45_000, attemptTimeoutMs: 45_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Non foi posible realizar o envío.');
  return resultado;
}

function eHostProduccion(hostname) {
  return PRODUCTION_HOSTS.has(clean(hostname).toLowerCase());
}

function emailValido(value) {
  const correo = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : '';
}

function tokenDesdeLigazon(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== 'https:' || !eHostProduccion(url.hostname)) return null;
    if (url.pathname !== '/revision-datos/' && url.pathname !== '/revision-datos') return null;
    const token = clean(url.searchParams.get('token'));
    if (!/^[A-Za-z0-9_-]{30,160}$/.test(token)) return null;
    return { token, ligazon: url.toString() };
  } catch { return null; }
}

async function cargarInvitacion(env, token) {
  const object = await env.R2_PRIVADO?.get?.(`${TOKEN_PREFIX}${token}.json`);
  if (!object) return null;
  try { return await object.json(); } catch { return null; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestUrl = new URL(request.url);

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

  let authData;
  try { authData = await verificarAdministrador(context, data); }
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
    if (clean(invitation.estado) !== 'PENDENTE') {
      omitidos.push({ idPersoa: invitation.idPersoa, nome: invitation?.persoa?.nomeCompleto, motivo: 'A revisión xa non está pendente' });
      continue;
    }
    if (Date.parse(invitation.caducaEn || '') <= agora) {
      omitidos.push({ idPersoa: invitation.idPersoa, nome: invitation?.persoa?.nomeCompleto, motivo: 'A revisión está caducada' });
      continue;
    }

    const xeracion = clean(invitation.xeracion);
    if (xeracion !== '' && xeracion !== 'INDIVIDUAL' && xeracion !== 'MASIVA') {
      omitidos.push({ idPersoa: invitation.idPersoa, nome: invitation?.persoa?.nomeCompleto, motivo: 'Tipo de xeración de revisión non permitido' });
      continue;
    }

    const correo = emailValido(invitation?.persoa?.correo);
    const revisionId = clean(invitation.revisionId);
    const idPersoa = clean(invitation.idPersoa);
    if (!correo || !revisionId || !idPersoa) {
      omitidos.push({ idPersoa, nome: invitation?.persoa?.nomeCompleto, motivo: 'A revisión non ten datos suficientes para o envío' });
      continue;
    }

    envios.push({
      revisionId,
      idPersoa,
      nome: clean(invitation?.persoa?.nomeCompleto) || idPersoa,
      correo,
      ligazon: parsed.ligazon,
      caducaEn: clean(invitation.caducaEn),
      versionLegal: clean(invitation?.textoLegalDatos?.version || invitation?.textoLegal?.version)
    });
  }

  if (!envios.length) {
    return json(400, { ok: false, erro: 'Non hai ningunha revisión válida para enviar.', omitidos });
  }

  let resultado;
  try { resultado = await enviarAppsScript(env, authData.user, envios); }
  catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible realizar o envío.' });
  }

  return json(200, {
    ok: true,
    permisoFonte: authData.permiso?.fonte || 'R2-PERMISOS',
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
