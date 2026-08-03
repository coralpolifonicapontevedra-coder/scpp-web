import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_FRESCA_MS = 15 * 60 * 1000;
const CACHE_RESPALDO_MS = 24 * 60 * 60 * 1000;
const CACHE_TOKEN_MS = 10 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8 * 1000;
const TIMEOUT_LISTADO_MS = 25 * 1000;
const TIMEOUT_FICHEIRO_MS = 30 * 1000;

const cacheTokens = new Map();
const cachePersoas = new Map();

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

function limparCache(cache, maximo = 30) {
  const agora = Date.now();
  for (const [clave, entrada] of cache.entries()) {
    if (!entrada || agora - entrada.savedAt > CACHE_RESPALDO_MS) cache.delete(clave);
  }
  while (cache.size > maximo) cache.delete(cache.keys().next().value);
}

async function fetchConTempoLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
  const cacheado = cacheTokens.get(token);
  if (cacheado && cacheado.expira > Date.now()) return cacheado.usuario;

  const resposta = await fetchConTempoLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    TIMEOUT_FIREBASE_MS
  );
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;

  const resultado = {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
  cacheTokens.set(token, { usuario: resultado, expira: Date.now() + CACHE_TOKEN_MS });
  return resultado;
}

function cacheRequest(request, email) {
  const url = new URL(request.url);
  url.pathname = '/api/_cache/persoas-administracion';
  url.search = `administrador=${encodeURIComponent(email)}&storage=r2-v1`;
  return new Request(url.toString(), { method: 'GET' });
}

async function lerCachePersistente(request, email) {
  const memoria = cachePersoas.get(email);
  if (memoria && Date.now() - memoria.savedAt <= CACHE_RESPALDO_MS) return memoria;
  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return null;
  try {
    const resposta = await cacheApi.match(cacheRequest(request, email));
    if (!resposta) return null;
    const entrada = await resposta.json();
    if (!entrada?.payload?.ok || !Array.isArray(entrada.payload.persoas)) return null;
    if (Date.now() - Number(entrada.savedAt || 0) > CACHE_RESPALDO_MS) return null;
    cachePersoas.set(email, entrada);
    limparCache(cachePersoas);
    return entrada;
  } catch (erro) {
    console.warn('Non se puido ler a caché de persoas:', erro);
    return null;
  }
}

async function gardarCachePersistente(request, email, payload) {
  if (!payload?.ok || !Array.isArray(payload.persoas)) return;
  const entrada = { savedAt: Date.now(), payload };
  cachePersoas.set(email, entrada);
  limparCache(cachePersoas);
  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return;
  try {
    await cacheApi.put(cacheRequest(request, email), new Response(JSON.stringify(entrada), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `private, max-age=${Math.floor(CACHE_RESPALDO_MS / 1000)}`
      }
    }));
  } catch (erro) {
    console.warn('Non se puido gardar a caché de persoas:', erro);
  }
}

function corpoAppsScript(env, usuario, accion, datos = {}) {
  const idPersoa = String(datos.idPersoa || datos.id || datos.rowId || '').trim();
  return {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: usuario.email,
    uidFirebase: usuario.uid,
    idPersoa,
    id: idPersoa,
    rowId: idPersoa
  };
}

function claveFichaR2Valida(valor) {
  const clave = String(valor || '').trim().replace(/^\/+/, '');
  if (!clave || clave.includes('..') || clave.includes('\\')) return '';
  return clave.startsWith('persoas/fichas/') ? clave : '';
}

async function respostaFichaR2(env, resultado) {
  if (!env.R2_PRIVADO) {
    return json(503, { ok: false, erro: 'O almacén privado R2 non está configurado.' });
  }
  const clave = claveFichaR2Valida(resultado?.r2Key);
  if (!clave) return json(400, { ok: false, erro: 'A clave R2 da ficha non é válida.' });

  const obxecto = await env.R2_PRIVADO.get(clave);
  if (!obxecto) return json(404, { ok: false, erro: 'A ficha non aparece no almacén R2.' });

  const nome = String(resultado?.nomeFicheiro || clave.split('/').pop() || 'ficha.pdf')
    .replace(/[\r\n"]/g, '');
  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${nome}"`);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Storage', 'R2');
  if (obxecto.httpEtag) headers.set('ETag', obxecto.httpEtag);
  return new Response(obxecto.body, { status: 200, headers });
}

async function consultarListado(env, usuario) {
  const { resultado, usouRespaldo, intento } = await obterJsonAppsScript(
    env,
    corpoAppsScript(env, usuario, 'listarPersoasAdministracion'),
    { timeoutMs: TIMEOUT_LISTADO_MS, attemptTimeoutMs: 20 * 1000 }
  );
  if (!resultado?.ok) {
    const erro = new Error(resultado?.erro || 'Non foi posible consultar as persoas.');
    erro.status = resultado?.erro === 'Usuario non autorizado' ? 403 : 400;
    throw erro;
  }
  return { resultado, usouRespaldo, intento };
}

async function actualizarCache(context, usuario) {
  try {
    const { resultado } = await consultarListado(context.env, usuario);
    await gardarCachePersistente(context.request, usuario.email, resultado);
  } catch (erro) {
    console.warn('Non se puido actualizar a caché de persoas en segundo plano:', erro);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
  }

  let datos;
  try { datos = await request.json(); } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try { usuario = await verificarTokenFirebase(datos.idToken, env.FIREBASE_API_KEY); } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || 'listarPersoasAdministracion').trim();
  if (!['listarPersoasAdministracion', 'obterFichaPersoaAdministracion'].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  if (accion === 'listarPersoasAdministracion') {
    const cacheada = await lerCachePersistente(request, usuario.email);
    if (cacheada) {
      const idade = Date.now() - cacheada.savedAt;
      if (idade >= CACHE_FRESCA_MS) {
        const tarefa = actualizarCache(context, usuario);
        if (typeof context.waitUntil === 'function') context.waitUntil(tarefa);
      }
      return json(200, cacheada.payload, {
        'X-SCPP-Cache': idade < CACHE_FRESCA_MS ? 'HIT' : 'STALE-WHILE-REVALIDATE',
        'X-SCPP-Data-Age': String(Math.max(0, Math.floor(idade / 1000)))
      });
    }
  }

  const inicio = Date.now();
  try {
    if (accion === 'obterFichaPersoaAdministracion') {
      const { resultado, usouRespaldo } = await obterJsonAppsScript(
        env,
        corpoAppsScript(env, usuario, accion, datos),
        { timeoutMs: TIMEOUT_FICHEIRO_MS, attemptTimeoutMs: 20 * 1000 }
      );
      if (!resultado?.ok) {
        const prohibido = resultado?.erro === 'Usuario non autorizado';
        return json(prohibido ? 403 : 400, {
          ok: false,
          erro: prohibido
            ? 'Non tes permiso para consultar os datos de persoas.'
            : (resultado?.erro || 'Non foi posible abrir a ficha.')
        });
      }
      const resposta = await respostaFichaR2(env, resultado);
      if (usouRespaldo) resposta.headers.set('X-SCPP-AppScript', 'FALLBACK');
      return resposta;
    }

    const { resultado, usouRespaldo, intento } = await consultarListado(env, usuario);
    await gardarCachePersistente(request, usuario.email, resultado);
    return json(200, resultado, {
      'X-SCPP-Cache': 'MISS',
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
      'X-SCPP-AppScript-Attempt': String(intento),
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error('Erro na administración de persoas:', erro);
    const cacheada = await lerCachePersistente(request, usuario.email);
    if (accion === 'listarPersoasAdministracion' && cacheada?.payload?.persoas) {
      return json(200, cacheada.payload, {
        'X-SCPP-Cache': 'EMERGENCY',
        'X-SCPP-Warning': 'upstream-unavailable'
      });
    }
    const status = Number(erro?.status) ||
      (erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503);
    return json(status, {
      ok: false,
      erro: status === 403
        ? 'Non tes permiso para consultar os datos de persoas.'
        : 'O servizo de persoas non está dispoñible neste momento.'
    });
  }
}
