import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

const CACHE_MS = 60 * 1000;
let statusCache = null;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
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
      id: file.replace(/\.yml$/, ''), label, ...workflowState(run),
      updatedAt: run?.updated_at || run?.created_at || null,
      url: run?.html_url || null, runNumber: run?.run_number || null
    };
  } catch (error) {
    return {
      id: file.replace(/\.yml$/, ''), label, state: 'unknown', labelState: 'Sen datos',
      error: error instanceof Error ? error.message : String(error), updatedAt: null, url: null, runNumber: null
    };
  }
}

async function backupStatus(githubToken) {
  const check = await latestWorkflowRun('backup-sheets-r2.yml', 'Copias de seguridade', githubToken);
  if (!check.updatedAt || check.state === 'unknown' || check.state === 'error' || check.state === 'running') return check;
  const ageMs = Date.now() - new Date(check.updatedAt).getTime();
  const maxAgeMs = 36 * 60 * 60 * 1000;
  if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
    return {
      ...check,
      state: 'error',
      labelState: 'Copia atrasada',
      error: 'A última copia de seguridade ten máis de 36 horas.'
    };
  }
  return { ...check, labelState: 'Última copia correcta' };
}

async function tpvStatus() {
  const url = 'https://coralpolifonicapontevedra.org/api/tpv/iniciar';
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'scpp-system-status' }
    }, 8000);
    const durationMs = Date.now() - started;
    const contentType = String(response.headers.get('content-type') || '');
    const body = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
    const ok = response.ok && body?.ok === true && body?.servizo === 'tpv-ceca';
    return {
      id: 'tpv-ceca',
      label: 'Pasarela TPV de Colabora',
      state: ok ? 'ok' : 'error',
      labelState: ok ? 'Operativa' : 'Con incidencias',
      updatedAt: new Date().toISOString(),
      durationMs,
      url: 'https://coralpolifonicapontevedra.org/donar/',
      error: ok ? null : (!contentType.includes('application/json')
        ? `O endpoint TPV devolveu ${contentType || 'un formato non identificado'} en lugar de JSON.`
        : body?.erro || `HTTP ${response.status}`)
    };
  } catch (error) {
    return {
      id: 'tpv-ceca', label: 'Pasarela TPV de Colabora', state: 'error', labelState: 'Non dispoñible',
      updatedAt: new Date().toISOString(), durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error), url: 'https://coralpolifonicapontevedra.org/donar/'
    };
  }
}

async function publicWebStatus() {
  const url = 'https://coralpolifonicapontevedra.org/';
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET', headers: { 'User-Agent': 'scpp-system-status' }
    }, 8000);
    const durationMs = Date.now() - started;
    const ok = response.ok && String(response.headers.get('content-type') || '').includes('text/html');
    return {
      id: 'web-publica', label: 'Web pública', state: ok ? 'ok' : 'error',
      labelState: ok ? 'Dispoñible' : `HTTP ${response.status}`,
      updatedAt: new Date().toISOString(), durationMs, url
    };
  } catch (error) {
    return {
      id: 'web-publica', label: 'Web pública', state: 'error', labelState: 'Non dispoñible',
      updatedAt: new Date().toISOString(), durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error), url
    };
  }
}

async function appsScriptStatus(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  const started = Date.now();
  if (!url) return {
    id: 'apps-script', label: 'Apps Script', state: 'unknown', labelState: 'Non configurado',
    updatedAt: new Date().toISOString(), durationMs: 0, url
  };
  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 8000);
    const durationMs = Date.now() - started;
    const ok = response.ok;
    return {
      id: 'apps-script', label: 'Apps Script', state: ok ? 'ok' : 'error',
      labelState: ok ? 'Dispoñible' : `HTTP ${response.status}`,
      updatedAt: new Date().toISOString(), durationMs, url
    };
  } catch (error) {
    return {
      id: 'apps-script', label: 'Apps Script', state: 'error', labelState: 'Non dispoñible',
      updatedAt: new Date().toISOString(), durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error), url
    };
  }
}

async function r2Status(env) {
  const key = 'indices/revision-fotos-v1.json';
  const started = Date.now();
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') {
    return {
      id: 'r2', label: 'R2 Privado', state: 'unknown', labelState: 'Binding non configurado',
      updatedAt: new Date().toISOString(), durationMs: 0
    };
  }
  try {
    const object = await env.R2_PRIVADO.get(key);
    const durationMs = Date.now() - started;
    if (!object) return {
      id: 'r2', label: 'R2 Privado', state: 'warning', labelState: 'Obxecto non atopado',
      updatedAt: new Date().toISOString(), durationMs, url: key
    };
    return {
      id: 'r2', label: 'R2 Privado', state: 'ok', labelState: 'Accesible',
      updatedAt: new Date().toISOString(), durationMs, url: key
    };
  } catch (error) {
    return {
      id: 'r2', label: 'R2 Privado', state: 'error', labelState: 'Erro lendo R2',
      updatedAt: new Date().toISOString(), durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function firebaseStatus(env) {
  const started = Date.now();
  const key = String(env.FIREBASE_API_KEY || '').trim();
  if (!key) return {
    id: 'firebase', label: 'Firebase Identity', state: 'unknown', labelState: 'Non configurado',
    updatedAt: new Date().toISOString(), durationMs: 0
  };
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`;
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'invalid-token-for-healthcheck' })
    }, 8000);
    const durationMs = Date.now() - started;
    const status = response.status || 0;
    const state = status >= 500 ? 'error' : 'ok';
    return {
      id: 'firebase', label: 'Firebase Identity', state,
      labelState: state === 'ok' ? 'Dispoñible' : `HTTP ${status}`,
      updatedAt: new Date().toISOString(), durationMs, url
    };
  } catch (error) {
    return {
      id: 'firebase', label: 'Firebase Identity', state: 'error', labelState: 'Non dispoñible',
      updatedAt: new Date().toISOString(), durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error), url
    };
  }
}

async function buildStatus(env) {
  const token = String(env.GITHUB_TOKEN || env.GH_TOKEN || '').trim();
  const checks = await Promise.all([
    appsScriptStatus(env), r2Status(env), firebaseStatus(env), publicWebStatus(), tpvStatus(), backupStatus(token),
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
  const overall = counts.error > 0 ? 'error'
    : counts.unknown > 0 || counts.warning > 0 ? 'warning'
      : counts.running > 0 ? 'running' : 'ok';
  return { ok: true, generatedAt: new Date().toISOString(), overall, counts, checks };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo de Estado do sistema non está configurado.' });
  }
  let body;
  try { body = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida.' }); }

  let user;
  try { user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY); }
  catch (error) {
    console.error('Erro ao validar Firebase en Estado do sistema:', error);
    return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
  }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  let permiso;
  try { permiso = await comprobarPermisoEstado(env, user); }
  catch (error) {
    console.error('Erro ao comprobar o permiso de Estado do sistema:', error);
    return json(503, { ok: false, codigo: 'PERMISSION_UNAVAILABLE', erro: 'Non foi posible comprobar o permiso neste momento.' });
  }
  if (!permiso?.podeLer) {
    return json(403, { ok: false, codigo: 'ESTADO_REQUIRED', erro: 'Non tes permiso para consultar o estado do sistema.' });
  }

  if (statusCache?.expiresAt > Date.now()) return json(200, { ...statusCache.payload, cached: true });

  const payload = await buildStatus(env);
  statusCache = { payload, expiresAt: Date.now() + CACHE_MS };
  return json(200, { ...payload, cached: false });
}
