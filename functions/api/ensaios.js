const CACHE_FRESCA_MS = 10 * 60 * 1000;
const CACHE_RESPALDO_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TOKEN_MS = 10 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const R2_PREFIX = 'ensaios/cache/usuarios/';

const cacheTokens = new Map();
const cacheMemoria = new Map();

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

function erro(status, etapa, codigo, mensaxe) {
  return json(status, { ok: false, etapa, codigo, erro: mensaxe });
}

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function limparMap(cache, maximo = 100) {
  const agora = Date.now();
  for (const [clave, entrada] of cache.entries()) {
    if (!entrada || Number(entrada.expira || 0) <= agora) cache.delete(clave);
  }
  while (cache.size > maximo) cache.delete(cache.keys().next().value);
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
  const cached = cacheTokens.get(token);
  if (cached?.expira > Date.now()) return cached.usuario;

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
  limparMap(cacheTokens);
  return usuario;
}

function urlAppsScript(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) ? url : '';
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const url = urlAppsScript(env);
  if (!url) throw Object.assign(new Error('Non está configurada a implementación principal de Apps Script.'), { code: 'APPS_SCRIPT_NOT_CONFIGURED' });
  const response = await fetchConLimite(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: env.WEB_WRITE_TOKEN, accion, email: user.email, uidFirebase: user.uid, ...datos })
  }, TIMEOUT_APPS_SCRIPT_MS);

  const text = await response.text();
  let result;
  try { result = JSON.parse(text); }
  catch { throw Object.assign(new Error('Apps Script devolveu unha resposta non válida.'), { code: 'APPS_SCRIPT_INVALID_RESPONSE' }); }
  if (!response.ok || !result?.ok) {
    const message = result?.erro || `Apps Script respondeu HTTP ${response.status}.`;
    const code = result?.codigo || (response.status === 403 || /non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return result;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email || '').trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function r2Key(user) {
  return `${R2_PREFIX}${await hashEmail(user.email)}.json`;
}

function payloadValido(payload) {
  return payload?.ok === true && Array.isArray(payload.ensaios) && Array.isArray(payload.persoas);
}

async function lerR2(env, user) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  try {
    const object = await env.R2_PRIVADO.get(await r2Key(user));
    if (!object) return null;
    const entry = await object.json();
    if (entry?.email !== user.email || !payloadValido(entry?.payload)) return null;
    const idade = Date.now() - Number(entry.savedAt || 0);
    if (idade > CACHE_RESPALDO_MS) return null;
    return { ...entry, idade };
  } catch (error) {
    console.warn('Non se puido ler o índice de Ensaios desde R2:', error);
    return null;
  }
}

async function gardarR2(env, user, payload) {
  if (!payloadValido(payload) || !env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return;
  const savedAt = Date.now();
  await env.R2_PRIVADO.put(await r2Key(user), JSON.stringify({ savedAt, email: user.email, payload }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
}

function cacheKey(user) { return user.email; }

async function lerCache(env, user) {
  const key = cacheKey(user);
  const memory = cacheMemoria.get(key);
  if (memory && memory.expira > Date.now()) return { payload: memory.payload, fonte: 'MEMORIA', idade: Date.now() - memory.savedAt };
  const r2 = await lerR2(env, user);
  if (!r2) return null;
  return { payload: r2.payload, fonte: r2.idade <= CACHE_FRESCA_MS ? 'R2-CACHE' : 'R2-STALE', idade: r2.idade };
}

async function gardarCache(env, user, payload) {
  const now = Date.now();
  cacheMemoria.set(cacheKey(user), { savedAt: now, expira: now + CACHE_FRESCA_MS, payload });
  limparMap(cacheMemoria, 50);
  await gardarR2(env, user, payload);
}

async function invalidarCache(env, user) {
  cacheMemoria.delete(cacheKey(user));
  if (env.R2_PRIVADO && typeof env.R2_PRIVADO.delete === 'function') {
    try { await env.R2_PRIVADO.delete(await r2Key(user)); }
    catch (error) { console.warn('Non se puido invalidar o índice de Ensaios en R2:', error); }
  }
}

function conDiagnostico(payload, fonte) {
  return {
    ...payload,
    diagnostico: {
      ...(payload.diagnostico || {}),
      fonte,
      xeradoEn: payload.diagnostico?.xeradoEn || payload.xeradoEn || new Date().toISOString()
    }
  };
}

async function listar(context, user, forzar = false) {
  if (!forzar) {
    const cached = await lerCache(context.env, user);
    if (cached?.payload && cached.idade <= CACHE_FRESCA_MS) {
      return json(200, conDiagnostico(cached.payload, cached.fonte), {
        'X-SCPP-Cache': 'HIT',
        'X-SCPP-Storage': cached.fonte,
        'Server-Timing': 'apps-script;dur=0'
      });
    }
  }

  const inicio = Date.now();
  try {
    const result = await chamarAppsScript(context.env, user, 'listarEnsaiosPortal');
    const payload = {
      ok: true,
      perfil: result.perfil || {},
      ensaios: Array.isArray(result.ensaios) ? result.ensaios : [],
      persoas: Array.isArray(result.persoas) ? result.persoas : [],
      asistencias: Array.isArray(result.asistencias) ? result.asistencias : [],
      ensaiosRepertorio: Array.isArray(result.ensaiosRepertorio) ? result.ensaiosRepertorio : [],
      repertorio: Array.isArray(result.repertorio) ? result.repertorio : [],
      seguimento: result.seguimento || {},
      xeradoEn: new Date().toISOString()
    };
    await gardarCache(context.env, user, payload);
    return json(200, conDiagnostico(payload, 'SHEET'), {
      'X-SCPP-Cache': forzar ? 'REFRESH' : 'MISS',
      'X-SCPP-Storage': 'SHEET',
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (error) {
    const stale = await lerR2(context.env, user);
    if (stale?.payload) {
      return json(200, conDiagnostico(stale.payload, 'R2-STALE'), {
        'X-SCPP-Cache': 'STALE',
        'X-SCPP-Storage': 'R2-STALE',
        'X-SCPP-Warning': 'Apps-Script-Unavailable'
      });
    }
    throw error;
  }
}

async function escribir(context, user, accion, datos) {
  const inicio = Date.now();
  const result = await chamarAppsScript(context.env, user, accion, datos);
  await invalidarCache(context.env, user);
  try {
    const fresh = await chamarAppsScript(context.env, user, 'listarEnsaiosPortal');
    const payload = {
      ok: true,
      perfil: fresh.perfil || {},
      ensaios: fresh.ensaios || [],
      persoas: fresh.persoas || [],
      asistencias: fresh.asistencias || [],
      ensaiosRepertorio: fresh.ensaiosRepertorio || [],
      repertorio: fresh.repertorio || [],
      seguimento: fresh.seguimento || {},
      xeradoEn: new Date().toISOString()
    };
    await gardarCache(context.env, user, payload);
  } catch (error) {
    console.warn('A escritura completouse, pero non se puido rexenerar o índice de Ensaios:', error);
  }
  return json(200, { ok: true, resultado: result.resultado || result, diagnostico: { fonte: 'SHEET-WRITE', duracionMs: Date.now() - inicio } }, {
    'X-SCPP-Cache': 'INVALIDATED',
    'X-SCPP-Storage': 'SHEET'
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return erro(405, 'REQUEST', 'METHOD_NOT_ALLOWED', 'Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return erro(500, 'CONFIG', 'MISSING_CONFIG', 'O servizo non está configurado correctamente.');

  let body;
  try { body = await request.json(); }
  catch { return erro(400, 'REQUEST', 'INVALID_JSON', 'Solicitude non válida.'); }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch (error) {
    console.error('Erro ao validar Firebase en Ensaios:', error);
    return erro(503, 'FIREBASE', 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.');
  }
  if (!user) return erro(401, 'AUTH', 'INVALID_SESSION', 'A identificación non é válida ou caducou.');

  const accion = String(body.accion || 'listarEnsaiosPortal').trim();
  const permitidas = new Set(['listarEnsaiosPortal', 'gardarEnsaio', 'gardarAsistenciaEnsaio', 'gardarEnsaioRepertorio', 'obterSeguimentoEnsaios']);
  if (!permitidas.has(accion)) return erro(400, 'REQUEST', 'ACTION_NOT_ALLOWED', 'Acción non permitida.');

  try {
    if (accion === 'listarEnsaiosPortal') return await listar(context, user, body.forzar === true);
    if (accion === 'gardarEnsaio') {
      return await escribir(context, user, 'gardarEnsaioPortal', {
        data: String(body.data || '').trim(),
        horaInicio: String(body.horaInicio || '').trim(),
        horaFin: String(body.horaFin || '').trim(),
        lugar: String(body.lugar || '').trim(),
        tipoEnsaio: String(body.tipoEnsaio || '').trim(),
        concerto: String(body.concerto || '').trim(),
        descricion: String(body.descricion || '').trim(),
        observacions: String(body.observacions || '').trim(),
        cancelado: body.cancelado === true
      });
    }
    if (accion === 'gardarAsistenciaEnsaio') {
      return await escribir(context, user, 'gardarAsistenciaEnsaioPortal', {
        idEnsaio: String(body.idEnsaio || '').trim(),
        idPersoa: String(body.idPersoa || '').trim(),
        estadoAsistencia: String(body.estadoAsistencia || '').trim(),
        xustificada: body.xustificada === true,
        motivo: String(body.motivo || '').trim(),
        observacions: String(body.observacions || '').trim()
      });
    }
    if (accion === 'gardarEnsaioRepertorio') {
      return await escribir(context, user, 'gardarEnsaioRepertorioPortal', {
        idEnsaio: String(body.idEnsaio || '').trim(),
        idRepertorio: String(body.idRepertorio || '').trim(),
        tipoTraballo: String(body.tipoTraballo || '').trim(),
        desde: String(body.desde || '').trim(),
        ata: String(body.ata || '').trim(),
        observacions: String(body.observacions || '').trim()
      });
    }
    const result = await chamarAppsScript(env, user, 'obterSeguimentoEnsaiosPortal', {
      desde: String(body.desde || '').trim(),
      ata: String(body.ata || '').trim(),
      concerto: String(body.concerto || '').trim(),
      voz: String(body.voz || '').trim()
    });
    return json(200, { ok: true, seguimento: result.seguimento || {} }, { 'X-SCPP-Cache': 'NO-STORE' });
  } catch (error) {
    console.error('Erro no módulo Ensaios:', error);
    if (error?.code === 'FORBIDDEN') return erro(403, 'PERMISOS', 'FORBIDDEN', 'Non tes permisos para realizar esta operación.');
    if (error?.name === 'AbortError') return erro(504, 'APPS_SCRIPT', 'TIMEOUT', 'O servizo de datos tardou demasiado en responder.');
    const code = error?.code || 'UNAVAILABLE';
    const stage = code.startsWith('APPS_SCRIPT') ? 'APPS_SCRIPT' : 'APPS_SCRIPT_RESULT';
    return erro(503, stage, code, error instanceof Error ? error.message : 'Non foi posible completar a operación.');
  }
}
