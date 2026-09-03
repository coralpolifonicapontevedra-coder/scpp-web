import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const CACHE_MS = 60 * 1000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';

let statusCache = null;

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

  return {
    uid: String(user.localId || ''),
    email: String(user.email).trim().toLowerCase()
  };
}

async function hashEmail(email) {
  const bytes = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function comprobarAdministracion(env, user) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') {
    return { allowed: false, known: false };
  }

  try {
    const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
    if (!object) return { allowed: false, known: false };
    const entry = await object.json().catch(() => null);
    const allowed = String(entry?.administrador || '').trim().toLowerCase() === user.email
      && entry?.payload?.perfil?.nivel === 'Administración';
    return { allowed, known: true };
  } catch (error) {
    console.error('Erro ao comprobar permisos R2 para Estado do sistema:', error);
    return { allowed: false, known: false };
  }
}

async function comprobarAccesoEstado(context, user) {
  const { env } = context;
  const cacheado = await obterPermisoPortalCacheado(env, user, 'estado');
  if (cacheado?.podeLer) {
    return { allowed: true, known: true, nivel: cacheado.nivel, fonte: cacheado.fonte };
  }

  const administration = await comprobarAdministracion(env, user);
  if (administration.allowed) {
    const preparar = obterPermisoPortal(env, user, 'estado').catch((error) => {
      console.warn('Non se puido preparar a caché común do permiso Estado:', error);
    });
    if (typeof context.waitUntil === 'function') context.waitUntil(preparar);
    else preparar.catch(() => {});
    return { allowed: true, known: true, nivel: 'administracion', fonte: 'ADMIN_R2_FALLBACK' };
  }

  let permiso = cacheado;
  if (!permiso) {
    try {
      permiso = await obterPermisoPortal(env, user, 'estado');
    } catch (error) {
      console.error('Erro ao resolver o permiso común de Estado:', error);
    }
  }

  if (permiso?.podeLer) {
    return { allowed: true, known: true, nivel: permiso.nivel, fonte: permiso.fonte };
  }

  return {
    allowed: false,
    known: Boolean(permiso?.ok) || administration.known,
    nivel: permiso?.nivel || 'sen_acceso',
    fonte: permiso?.fonte || (administration.known ? 'ADMIN_R2' : 'UNAVAILABLE')
  };
}

function workflowState(run) {
  if (!run) return { state: 'unknown', labelState: 'Sen datos' };
  if (run.status !== 'completed') return { state: 'running', labelState: 'En execución' };
  if (run.conclusion === 'success') return { state: 'ok', labelState: 'Correcto' };
  if (run.conclusion === 'cancelled' || run.conclusion === 'skipped') {
    return { state: 'warning', labelState: run.conclusion === 'cancelled' ? 'Cancelado' : 'Omitido' };
  }
  return { state: 'error', labelState: 'Con incidencias' };
}

async function latestWorkflowRun(file, label, githubToken) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'scpp-system-status',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/coralpolifonicapontevedra-coder/scpp-web/actions/workflows/${file}/runs?branch=main&per_page=1`,
      { headers },
      8000
    );
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);

    const run = (await response.json())?.workflow_runs?.[0] || null;
    return {
      id: file.replace(/\.yml$/, ''),
      label,
      ...workflowState(run),
      updatedAt: run?.updated_at || run?.created_at || null,
      url: run?.html_url || null,
      runNumber: run?.run_number || null
    };
  } catch (error) {
    return {
      id: file.replace(/\.yml$/, ''),
      label,
      state: 'unknown',
      labelState: 'Sen datos',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: null,
      url: null,
      runNumber: null
    };
  }
}

async function publicWebStatus() {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout('https://scpp-web.pages.dev/', {
      method: 'GET',
      headers: { 'User-Agent': 'scpp-system-status' }
    }, 8000);
    const durationMs = Date.now() - started;
    const ok = response.ok && String(response.headers.get('content-type') || '').includes('text/html');
    return {
      id: 'web-publica',
      label: 'Web pública',
      state: ok ? 'ok' : 'error',
      labelState: ok ? 'Dispoñible' : `HTTP ${response.status}`,
      updatedAt: new Date().toISOString(),
      durationMs,
      url: 'https://scpp-web.pages.dev/'
    };
  } catch (error) {
    return {
      id: 'web-publica',
      label: 'Web pública',
      state: 'error',
      labelState: 'Non dispoñible',
      updatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      url: 'https://scpp-web.pages.dev/'
    };
  }
}

async function appsScriptStatus(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  const started = Date.now();
  if (!url) return {
    id: 'apps-script',
    label: 'Apps Script',
    state: 'unknown',
    labelState: 'Non configurado',
    updatedAt: new Date().toISOString(),
    durationMs: 0,
    url
  };

  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 8000);
    const durationMs = Date.now() - started;
    const ok = response.ok;
    return {
      id: 'apps-script',
      label: 'Apps Script',
      state: ok ? 'ok' : 'error',
      labelState: ok ? 'Dispoñible' : `HTTP ${response.status}`,
      updatedAt: new Date().toISOString(),
      durationMs,
      url
    };
  } catch (error) {
    return {
      id: 'apps-script',
      label: 'Apps Script',
      state: 'error',
      labelState: 'Non dispoñible',
      updatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      url
    };
  }
}

async function r2Status(env) {
  const key = 'indices/revision-fotos-v1.json';
  const started = Date.now();
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') {
    return {
      id: 'r2',
      label: 'R2 Privado',
      state: 'unknown',
      labelState: 'Binding non configurado',
      updatedAt: new Date().toISOString(),
      durationMs: 0
    };
  }

  try {
    const object = await env.R2_PRIVADO.get(key);
    const durationMs = Date.now() - started;
    if (!object) {
      return {
        id: 'r2',
        label: 'R2 Privado',
        state: 'warning',
        labelState: 'Obxecto non atopado',
        updatedAt: new Date().toISOString(),
        durationMs,
        url: key
      };
    }

    return {
      id: 'r2',
      label: 'R2 Privado',
      state: 'ok',
      labelState: 'Accesible',
      updatedAt: new Date().toISOString(),
      durationMs,
      url: key
    };
  } catch (error) {
    return {
      id: 'r2',
      label: 'R2 Privado',
      state: 'error',
      labelState: 'Erro lendo R2',
      updatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function firebaseStatus(env) {
  const started = Date.now();
  const key = String(env.FIREBASE_API_KEY || '').trim();
  if (!key) return {
    id: 'firebase',
    label: 'Firebase Identity',
    state: 'unknown',
    labelState: 'Non configurado',
    updatedAt: new Date().toISOString(),
    durationMs: 0
  };

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`;
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'invalid-token-for-healthcheck' })
    }, 8000);
    const durationMs = Date.now() - started;
    const status = response.status || 0;
    const state = status >= 500 ? 'error' : 'ok';
    return {
      id: 'firebase',
      label: 'Firebase Identity',
      state,
      labelState: state === 'ok' ? 'Dispoñible' : `HTTP ${status}`,
      updatedAt: new Date().toISOString(),
      durationMs,
      url
    };
  } catch (error) {
    return {
      id: 'firebase',
      label: 'Firebase Identity',
      state: 'error',
      labelState: 'Non dispoñible',
      updatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      url
    };
  }
}

async function buildStatus(env) {
  const token = String(env.GITHUB_TOKEN || env.GH_TOKEN || '').trim();
  const checks = await Promise.all([
    appsScriptStatus(env),
    r2Status(env),
    firebaseStatus(env),
    publicWebStatus(),
    latestWorkflowRun('quality.yml', 'Calidade do proxecto', token),
    latestWorkflowRun('check-public-links.yml', 'Enlaces públicos', token),
    latestWorkflowRun('audit-file-systems.yml', 'Arquivos e documentación', token),
    latestWorkflowRun('audit-concert-media.yml', 'Medios de concertos', token),
    latestWorkflowRun('audit-repertorio.yml', 'Repertorio', token),
    latestWorkflowRun('audit-fotos-r2.yml', 'Fotografías en R2', token)
  ]);

  const counts = checks.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {});

  const overall = counts.error > 0
    ? 'error'
    : counts.unknown > 0 || counts.warning > 0
      ? 'warning'
      : counts.running > 0
        ? 'running'
        : 'ok';

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    overall,
    counts,
    checks
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo de Estado do sistema non está configurado.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida.' });
  }

  let user;
  try {
    user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY);
  } catch (error) {
    console.error('Erro ao validar Firebase en Estado do sistema:', error);
    return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
  }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  const acceso = await comprobarAccesoEstado(context, user);
  if (!acceso.allowed) {
    return json(acceso.known ? 403 : 503, {
      ok: false,
      codigo: acceso.known ? 'ESTADO_PERMISSION_REQUIRED' : 'PERMISSION_UNAVAILABLE',
      erro: acceso.known
        ? 'Non tes permiso para consultar o estado do sistema.'
        : 'Non foi posible comprobar o permiso de acceso neste momento.'
    }, { 'X-SCPP-Permission-Source': acceso.fonte || 'UNAVAILABLE' });
  }

  const permissionHeaders = {
    'X-SCPP-Permission-Source': acceso.fonte || 'UNKNOWN',
    'X-SCPP-Permission-Level': acceso.nivel || 'sen_acceso'
  };

  if (statusCache?.expiresAt > Date.now()) {
    return json(200, { ...statusCache.payload, cached: true }, permissionHeaders);
  }

  const payload = await buildStatus(env);
  statusCache = { payload, expiresAt: Date.now() + CACHE_MS };
  return json(200, { ...payload, cached: false }, permissionHeaders);
}
