import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const WORKFLOW_URL = 'https://github.com/coralpolifonicapontevedra-coder/scpp-web/actions/workflows/audit-repertorio.yml';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;
  const response = await fetchWithTimeout(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    8000
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: String(user.localId || ''), email: String(user.email).trim().toLowerCase() };
}

async function comprobarPermisoEstado(env, user) {
  let permiso = await obterPermisoPortalCacheado(env, user, 'estado');
  if (!permiso) permiso = await obterPermisoPortal(env, user, 'estado');
  return permiso;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  }

  let body;
  try { body = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida.' }); }

  let user;
  try { user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  let permiso;
  try { permiso = await comprobarPermisoEstado(env, user); }
  catch { return json(503, { ok: false, erro: 'Non foi posible comprobar o permiso neste momento.' }); }
  if (!permiso?.podeLer) return json(403, { ok: false, erro: 'Non tes permiso para executar esta comprobación.' });

  const accion = String(body?.accion || '').trim();
  if (accion !== 'repertorio') return json(400, { ok: false, erro: 'Comprobación non permitida.' });

  const githubToken = String(env.GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_PAT || env.GH_PAT || '').trim();
  if (!githubToken) {
    return json(503, {
      ok: false,
      codigo: 'GITHUB_CREDENTIALS_MISSING',
      erro: 'Non hai credenciais de GitHub configuradas para iniciar a auditoría automaticamente.',
      manualUrl: WORKFLOW_URL
    });
  }

  const response = await fetchWithTimeout(
    'https://api.github.com/repos/coralpolifonicapontevedra-coder/scpp-web/actions/workflows/audit-repertorio.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'scpp-system-status',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ ref: 'main' })
    },
    10000
  );

  if (response.status !== 204) {
    const detalle = await response.text().catch(() => '');
    console.error('Non foi posible iniciar audit-repertorio:', response.status, detalle);
    return json(502, {
      ok: false,
      codigo: response.status === 403 ? 'GITHUB_FORBIDDEN' : 'GITHUB_DISPATCH_ERROR',
      erro: response.status === 403
        ? 'GitHub non permite iniciar a auditoría coas credenciais actuais.'
        : `Non foi posible iniciar a auditoría en GitHub (HTTP ${response.status}).`,
      manualUrl: WORKFLOW_URL
    });
  }

  return json(200, { ok: true, iniciado: true, accion: 'repertorio' });
}

export function onRequest() {
  return json(405, { ok: false, erro: 'Método non permitido.' });
}
