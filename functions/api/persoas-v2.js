const CACHE_FRESCA_MS = 10 * 60 * 1000;
const CACHE_RESPALDO_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_R2_PREFIX = 'persoas/cache/administracion/';
const PERFIS_R2_KEY = 'persoas/cache/perfis.json';
const CACHE_TOKEN_MS = 10 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8000;
const TIMEOUT_APPS_SCRIPT_MS = 15000;

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

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function limparMap(cache, maximo = 30) {
  const agora = Date.now();
  for (const [clave, entrada] of cache.entries()) {
    if (!entrada || agora - Number(entrada.savedAt || 0) > CACHE_RESPALDO_MS) {
      cache.delete(clave);
    }
  }
  while (cache.size > maximo) cache.delete(cache.keys().next().value);
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;

  const cacheado = cacheTokens.get(token);
  if (cacheado && cacheado.expira > Date.now()) return cacheado.usuario;

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

  const usuario = {
    uid: String(user.localId || ''),
    email: String(user.email).trim().toLowerCase()
  };

  cacheTokens.set(token, {
    usuario,
    expira: Date.now() + CACHE_TOKEN_MS,
    savedAt: Date.now()
  });
  limparMap(cacheTokens, 100);
  return usuario;
}

function urlAppsScriptPrincipal(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url)
    ? url
    : '';
}

async function chamarAppsScriptPrincipal(env, body) {
  const url = urlAppsScriptPrincipal(env);
  if (!url) {
    const error = new Error('Non está configurada a implementación principal de Apps Script.');
    error.code = 'APPS_SCRIPT_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetchConLimite(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    },
    TIMEOUT_APPS_SCRIPT_MS
  );

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    const error = new Error('Apps Script devolveu unha resposta non válida.');
    error.code = 'APPS_SCRIPT_INVALID_RESPONSE';
    error.detail = text.slice(0, 180);
    throw error;
  }

  if (!response.ok) {
    const error = new Error(result?.erro || `Apps Script respondeu HTTP ${response.status}.`);
    error.code = 'APPS_SCRIPT_HTTP_ERROR';
    throw error;
  }
  return result;
}

function cacheRequest(request, email) {
  const url = new URL(request.url);
  url.pathname = '/api/_cache/persoas-v2';
  url.search = `administrador=${encodeURIComponent(email)}&version=2`;
  return new Request(url.toString(), { method: 'GET' });
}

async function lerCache(request, email) {
  const memoria = cacheMemoria.get(email);
  if (memoria && Date.now() - memoria.savedAt <= CACHE_RESPALDO_MS) return memoria;

  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return null;

  try {
    const response = await cacheApi.match(cacheRequest(request, email));
    if (!response) return null;
    const entrada = await response.json();
    if (!entrada?.payload?.ok || !Array.isArray(entrada.payload.persoas)) return null;
    if (Date.now() - Number(entrada.savedAt || 0) > CACHE_RESPALDO_MS) return null;
    cacheMemoria.set(email, entrada);
    limparMap(cacheMemoria);
    return entrada;
  } catch (error) {
    console.warn('Non se puido ler a cache de Persoas v2:', error);
    return null;
  }
}

async function gardarCache(request, email, payload) {
  if (!payload?.ok || !Array.isArray(payload.persoas)) return;

  const entrada = { savedAt: Date.now(), payload };
  cacheMemoria.set(email, entrada);
  limparMap(cacheMemoria);

  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return;

  try {
    await cacheApi.put(
      cacheRequest(request, email),
      new Response(JSON.stringify(entrada), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${Math.floor(CACHE_RESPALDO_MS / 1000)}`
        }
      })
    );
  } catch (error) {
    console.warn('Non se puido gardar a cache de Persoas v2:', error);
  }
}

async function identificadorCache(valor) {
  const bytes = new TextEncoder().encode(String(valor || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function gardarCacheR2(env, email, payload) {
  if (
    !payload?.ok ||
    !Array.isArray(payload.persoas) ||
    !env.R2_PRIVADO ||
    typeof env.R2_PRIVADO.put !== 'function'
  ) {
    return;
  }

  try {
    const savedAt = Date.now();
    const id = await identificadorCache(email);
    await Promise.all([
      env.R2_PRIVADO.put(
        `${ADMIN_R2_PREFIX}${id}.json`,
        JSON.stringify({ savedAt, administrador: email, payload }),
        {
          httpMetadata: {
            contentType: 'application/json; charset=utf-8',
            cacheControl: 'private, no-store'
          }
        }
      ),
      env.R2_PRIVADO.put(
        PERFIS_R2_KEY,
        JSON.stringify({ savedAt, persoas: payload.persoas }),
        {
          httpMetadata: {
            contentType: 'application/json; charset=utf-8',
            cacheControl: 'private, no-store'
          }
        }
      )
    ]);
  } catch (error) {
    console.warn('Non se puido gardar o respaldo de Persoas v2 en R2:', error);
  }
}

async function lerCacheR2(env, email) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;

  try {
    const id = await identificadorCache(email);
    const object = await env.R2_PRIVADO.get(`${ADMIN_R2_PREFIX}${id}.json`);
    if (!object) return null;
    const entrada = await object.json();
    if (
      entrada?.administrador !== email ||
      !entrada?.payload?.ok ||
      entrada.payload.perfil?.nivel !== 'Administración' ||
      !Array.isArray(entrada.payload.persoas) ||
      Date.now() - Number(entrada.savedAt || 0) > CACHE_RESPALDO_MS
    ) {
      return null;
    }
    return entrada;
  } catch (error) {
    console.warn('Non se puido ler o respaldo de Persoas v2 desde R2:', error);
    return null;
  }
}

function corpoAppsScript(env, user, action, idPersoa = '') {
  return {
    token: env.WEB_WRITE_TOKEN,
    accion: action,
    email: user.email,
    uidFirebase: user.uid,
    idPersoa,
    id: idPersoa
  };
}

async function consultarListado(env, user) {
  const result = await chamarAppsScriptPrincipal(
    env,
    corpoAppsScript(env, user, 'listarPersoasAdministracion')
  );

  if (!result?.ok) {
    const error = new Error(result?.erro || 'Apps Script non completou a operación.');
    error.code = result?.erro === 'Usuario non autorizado' ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT';
    throw error;
  }

  return {
    ok: true,
    version: 'persoas-v2',
    perfil: result.perfil,
    persoas: Array.isArray(result.persoas) ? result.persoas : []
  };
}

async function actualizarCache(context, user) {
  try {
    const payload = await consultarListado(context.env, user);
    await Promise.all([
      gardarCache(context.request, user.email, payload),
      gardarCacheR2(context.env, user.email, payload)
    ]);
  } catch (error) {
    console.warn('Non se puido actualizar Persoas v2 en segundo plano:', error);
  }
}

function claveR2Valida(value) {
  const key = String(value || '').trim().replace(/^\/+/, '');
  if (!key || key.includes('..') || key.includes('\\')) return '';
  return key.startsWith('persoas/fichas/') ? key : '';
}

function fichaDesdeCache(cacheada, idPersoa) {
  const payload = cacheada?.payload;
  if (payload?.perfil?.nivel !== 'Administración' || !Array.isArray(payload.persoas)) {
    return null;
  }

  const referencia = String(idPersoa || '').trim();
  const persoa = payload.persoas.find((item) => [
    item?.idPersoa,
    item?.id,
    item?.rowId
  ].some((value) => String(value || '').trim() === referencia));

  if (
    !persoa ||
    persoa.fichaDisponibleR2 !== true ||
    String(persoa.fichaR2Estado || '').trim() !== 'SINCRONIZADO'
  ) {
    return null;
  }

  const r2Key = claveR2Valida(persoa.fichaR2Key);
  if (!r2Key) return null;

  return {
    ok: true,
    idPersoa: String(persoa.idPersoa || persoa.id || ''),
    r2Key,
    nomeFicheiro: r2Key.split('/').pop() || 'ficha.pdf'
  };
}

async function servirFicha(env, result, duracionAppsScript, autorizacion = 'APPS_SCRIPT') {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') {
    return json(503, {
      ok: false,
      etapa: 'R2_BINDING',
      erro: 'R2_PRIVADO non está dispoñible nesta implementación.'
    });
  }

  const key = claveR2Valida(result?.r2Key);
  if (!key) {
    return json(400, {
      ok: false,
      etapa: 'R2_KEY',
      erro: 'A clave R2 devolta por Apps Script non é válida.'
    });
  }

  const inicioR2 = Date.now();
  const object = await env.R2_PRIVADO.get(key);
  const duracionR2 = Date.now() - inicioR2;

  if (!object) {
    return json(404, {
      ok: false,
      etapa: 'R2_OBJECT',
      erro: `Non se atopou o obxecto ${key} en R2.`
    });
  }

  const name = String(result?.nomeFicheiro || key.split('/').pop() || 'ficha.pdf')
    .replace(/[\r\n"]/g, '');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${name}"`);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Storage', 'R2');
  headers.set('X-SCPP-Persoas-Version', 'v2');
  headers.set('X-SCPP-Authorization', autorizacion);
  const autorizacionTiming = autorizacion === 'CACHE'
    ? 'authorization-cache;dur=0'
    : `apps-script;dur=${duracionAppsScript}`;
  headers.set('Server-Timing', `${autorizacionTiming}, r2;dur=${duracionR2}`);
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

export async function onRequest(context) {
  const { request, env } = context;
  const inicioTotal = Date.now();

  if (request.method !== 'POST') {
    return json(405, { ok: false, etapa: 'REQUEST', erro: 'Método non permitido.' });
  }
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, etapa: 'CONFIG', erro: 'Faltan variables obrigatorias do servizo.' });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json(400, { ok: false, etapa: 'REQUEST', erro: 'Solicitude JSON non válida.' });
  }

  const inicioFirebase = Date.now();
  let user;
  try {
    user = await verificarFirebase(data.idToken, env.FIREBASE_API_KEY);
  } catch (error) {
    return json(503, {
      ok: false,
      etapa: 'FIREBASE',
      erro: error instanceof Error ? error.message : 'Fallou Firebase.'
    });
  }
  const duracionFirebase = Date.now() - inicioFirebase;

  if (!user) {
    return json(401, { ok: false, etapa: 'AUTH', erro: 'A identificación non é válida ou caducou.' });
  }

  const action = String(data.accion || 'listarPersoasAdministracion').trim();
  if (!['listarPersoasAdministracion', 'obterFichaPersoaAdministracion'].includes(action)) {
    return json(400, { ok: false, etapa: 'ACTION', erro: 'Acción non permitida.' });
  }

  if (action === 'listarPersoasAdministracion') {
    const cacheada = await lerCache(request, user.email);
    if (cacheada) {
      const idade = Date.now() - cacheada.savedAt;
      if (idade >= CACHE_FRESCA_MS) {
        const tarefa = actualizarCache(context, user);
        if (typeof context.waitUntil === 'function') context.waitUntil(tarefa);
      }

      return json(200, cacheada.payload, {
        'X-SCPP-Persoas-Version': 'v2',
        'X-SCPP-Cache': idade < CACHE_FRESCA_MS ? 'HIT' : 'STALE-WHILE-REVALIDATE',
        'X-SCPP-Data-Age': String(Math.max(0, Math.floor(idade / 1000))),
        'Server-Timing': `firebase;dur=${duracionFirebase}, total;dur=${Date.now() - inicioTotal}`
      });
    }

    const respaldoR2 = await lerCacheR2(env, user.email);
    if (respaldoR2?.payload?.persoas) {
      await gardarCache(request, user.email, respaldoR2.payload);
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(actualizarCache(context, user));
      }
      return json(200, respaldoR2.payload, {
        'X-SCPP-Persoas-Version': 'v2',
        'X-SCPP-Cache': 'R2',
        'X-SCPP-Data-Age': String(Math.max(0, Math.floor((Date.now() - respaldoR2.savedAt) / 1000))),
        'Server-Timing': `firebase;dur=${duracionFirebase}, r2;dur=0, total;dur=${Date.now() - inicioTotal}`
      });
    }

    const inicioAppsScript = Date.now();
    try {
      const payload = await consultarListado(env, user);
      const duracionAppsScript = Date.now() - inicioAppsScript;
      await Promise.all([
        gardarCache(request, user.email, payload),
        gardarCacheR2(env, user.email, payload)
      ]);

      return json(200, payload, {
        'X-SCPP-Persoas-Version': 'v2',
        'X-SCPP-Cache': 'MISS',
        'Server-Timing': `firebase;dur=${duracionFirebase}, apps-script;dur=${duracionAppsScript}, total;dur=${Date.now() - inicioTotal}`
      });
    } catch (error) {
      const cacheEmerxencia = await lerCache(request, user.email);
      if (cacheEmerxencia?.payload?.persoas) {
        return json(200, cacheEmerxencia.payload, {
          'X-SCPP-Persoas-Version': 'v2',
          'X-SCPP-Cache': 'EMERGENCY',
          'X-SCPP-Warning': 'apps-script-unavailable',
          'Server-Timing': `firebase;dur=${duracionFirebase}, total;dur=${Date.now() - inicioTotal}`
        });
      }

      const timeout = error instanceof Error && error.name === 'AbortError';
      const forbidden = error?.code === 'FORBIDDEN';
      return json(forbidden ? 403 : timeout ? 504 : 503, {
        ok: false,
        etapa: forbidden ? 'PERMISOS' : 'APPS_SCRIPT',
        codigo: error?.code || (timeout ? 'TIMEOUT' : 'UNAVAILABLE'),
        erro: timeout
          ? 'A implementación principal de Apps Script tardou demasiado en responder.'
          : (error instanceof Error ? error.message : 'Fallou Apps Script.')
      });
    }
  }

  const idPersoa = String(data.idPersoa || data.id || '').trim();
  if (!idPersoa) {
    return json(400, { ok: false, etapa: 'REQUEST', erro: 'Non se indicou a persoa.' });
  }

  // O listado xa foi autorizado para este administrador e inclúe a clave R2.
  // Servimos directamente desde R2; se non hai cache válida mantemos Apps Script
  // como respaldo para non romper accesos directos nin datos aínda non cacheados.
  const cacheada = await lerCache(request, user.email) || await lerCacheR2(env, user.email);
  const fichaCacheada = fichaDesdeCache(cacheada, idPersoa);
  if (fichaCacheada) {
    return servirFicha(env, fichaCacheada, 0, 'CACHE');
  }

  const inicioAppsScript = Date.now();
  let result;
  try {
    result = await chamarAppsScriptPrincipal(
      env,
      corpoAppsScript(env, user, action, idPersoa)
    );
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError';
    return json(timeout ? 504 : 503, {
      ok: false,
      etapa: 'APPS_SCRIPT',
      codigo: error?.code || (timeout ? 'TIMEOUT' : 'UNAVAILABLE'),
      erro: timeout
        ? 'A implementación principal de Apps Script tardou demasiado en responder.'
        : (error instanceof Error ? error.message : 'Fallou Apps Script.')
    });
  }
  const duracionAppsScript = Date.now() - inicioAppsScript;

  if (!result?.ok) {
    const forbidden = result?.erro === 'Usuario non autorizado';
    return json(forbidden ? 403 : 400, {
      ok: false,
      etapa: 'APPS_SCRIPT_RESULT',
      erro: result?.erro || 'Apps Script non completou a operación.'
    });
  }

  return servirFicha(env, result, duracionAppsScript);
}
