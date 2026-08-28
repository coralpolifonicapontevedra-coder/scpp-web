import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const ENSAIOS_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';

const clean = (value) => String(value || '').trim();
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
  try { return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

const tokenCache = new Map();
async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const cached = tokenCache.get(token);
  if (cached?.expires > Date.now()) return cached.user;
  const response = await fetchConLimite(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
  }, TIMEOUT_FIREBASE_MS);
  if (!response.ok) return null;
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  const user = { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
  tokenCache.set(token, { user, expires: Date.now() + 5 * 60 * 1000 });
  while (tokenCache.size > 100) tokenCache.delete(tokenCache.keys().next().value);
  return user;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function verificarAdministracionR2(env, user) {
  if (!env.R2_PRIVADO?.get) return false;
  const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const entry = await object.json().catch(() => null);
  return entry?.administrador === user.email && entry?.payload?.perfil?.nivel === 'Administración';
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: user.email,
    uidFirebase: user.uid,
    ...datos
  }, { timeoutMs: TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs: 8_000 });
  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

async function invalidarCacheEnsaios(env) {
  if (!env.R2_PRIVADO?.list) return;
  let cursor;
  do {
    const page = await env.R2_PRIVADO.list({ prefix: ENSAIOS_CACHE_PREFIX, cursor });
    const keys = (page.objects || []).map((item) => item.key);
    if (keys.length) await env.R2_PRIVADO.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

function prepararPersoas(result, idEnsaio) {
  const persoas = Array.isArray(result.persoas) ? result.persoas : [];
  const asistencias = Array.isArray(result.asistencias) ? result.asistencias : [];
  const porPersoa = new Map();
  asistencias.filter((a) => clean(a.ensaio) === idEnsaio).forEach((a) => porPersoa.set(clean(a.persoa), a));
  return persoas.map((p) => {
    const id = clean(p.idPersoa || p.id);
    const a = porPersoa.get(id) || null;
    let estado = '';
    if (a) estado = a.xustificada === true ? 'xustificada' : clean(a.estadoAsistencia).toLowerCase() === 'asiste' ? 'asiste' : 'non_asiste';
    return {
      id,
      nome: clean(p.nome),
      primeiroApelido: clean(p.primeiroApelido),
      segundoApelido: clean(p.segundoApelido),
      nomeCompleto: clean(p.nomeCompleto),
      voz: clean(p.voz),
      estado,
      xustificacion: clean(a?.motivo || a?.observacions)
    };
  }).filter((p) => p.id && p.voz);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  const body = await request.json().catch(() => null);
  if (!body) return json(400, { ok: false, erro: 'Solicitude non válida.' });

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user).catch(() => false))) return json(403, { ok: false, erro: 'Usuario non autorizado para Administración.' });

  const accion = clean(body.accion);
  const idEnsaio = clean(body.idEnsaio);
  if (!idEnsaio) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });

  try {
    if (accion === 'obterXestion') {
      const result = await chamarAppsScript(env, user, 'listarEnsaiosPortal');
      return json(200, { ok: true, persoas: prepararPersoas(result, idEnsaio) });
    }

    if (accion === 'gardarAsistencias') {
      const persoas = Array.isArray(body.persoas) ? body.persoas.slice(0, 100) : [];
      let gardadas = 0;
      for (const p of persoas) {
        const idPersoa = clean(p.id);
        const estado = clean(p.estado);
        if (!idPersoa || !['asiste', 'non_asiste', 'xustificada'].includes(estado)) continue;
        await chamarAppsScript(env, user, 'gardarAsistenciaEnsaioPortal', {
          idEnsaio,
          idPersoa,
          estadoAsistencia: estado === 'asiste' ? 'Asiste' : 'Non asiste',
          xustificada: estado === 'xustificada',
          motivo: estado === 'xustificada' ? clean(p.xustificacion) : '',
          observacions: estado === 'xustificada' ? clean(p.xustificacion) : ''
        });
        gardadas += 1;
      }
      await invalidarCacheEnsaios(env);
      return json(200, { ok: true, gardadas });
    }

    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : 502;
    return json(status, { ok: false, codigo: code, erro: error?.message || 'Non foi posible completar a operación.' });
  }
}
