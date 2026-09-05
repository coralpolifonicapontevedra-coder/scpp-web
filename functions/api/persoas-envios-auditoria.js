import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';
import { obterPermisoPortal } from '../_lib/portal-permissions.js';

const TIMEOUT_FIREBASE_MS = 8000;
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
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
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
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}

async function verificarAdministrador(env, data) {
  const user = await verificarFirebase(data?.idToken, env.FIREBASE_API_KEY);
  if (!user) throw Object.assign(new Error('A sesión administrativa non é válida.'), { status: 401 });
  const permiso = await obterPermisoPortal(env, user, 'persoas');
  if (!permiso?.podeAdministrar) {
    throw Object.assign(new Error('Non tes permiso de Administración no módulo Persoas.'), { status: 403 });
  }
  return user;
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido.' });
  }

  const { request, env } = context;
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'Falta configuración do servizo.' });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude JSON non válida.' });
  }

  let user;
  try {
    user = await verificarAdministrador(env, data);
  } catch (error) {
    return json(error.status || 503, { ok: false, erro: error.message });
  }

  try {
    const agora = Date.now();
    const desde = new Date(agora - 48 * 60 * 60 * 1000).toISOString();
    const ata = new Date(agora + 5 * 60 * 1000).toISOString();

    const { resultado } = await obterJsonAppsScriptPersoas(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'listarEnviosRevisionsPersoasAdministracion',
      email: user.email,
      actorEmail: user.email,
      uidFirebase: user.uid,
      autorizadoR2: true,
      desde,
      ata
    }, { timeoutMs: 20_000, attemptTimeoutMs: 20_000 });

    if (!resultado?.ok) {
      throw new Error(resultado?.erro || 'Non foi posible consultar o rexistro directo de envíos.');
    }

    return json(200, {
      ok: true,
      xeradoEn: new Date().toISOString(),
      envios: Array.isArray(resultado.envios) ? resultado.envios : [],
      cotaRestante: Number.isFinite(Number(resultado.cotaRestante)) ? Number(resultado.cotaRestante) : null,
      cotaObservadaEn: clean(resultado.cotaObservadaEn),
      restablecementoEstimado: clean(resultado.restablecementoEstimado),
      estimacionRestablecemento: resultado.estimacionRestablecemento === true
    });
  } catch (error) {
    return json(503, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non foi posible auditar os envíos.'
    });
  }
}
