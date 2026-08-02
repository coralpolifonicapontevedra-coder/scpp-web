import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_REPERTORIO_MS = 12 * 60 * 60 * 1000;
const CACHE_REPERTORIO_VERSION = '2026-08-02-r2-2';
const CACHE_ASISTENCIAS_MS = 5 * 60 * 1000;
const CACHE_TOKEN_MS = 5 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_REPERTORIO_MS = 55_000;
const TIMEOUT_ASISTENCIAS_MS = 30_000;
const TIMEOUT_FICHEIRO_MS = 40_000;

const cacheRespostas = new Map();
const cacheTokens = new Map();

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

function limparCache(cache, maximo = 100) {
  const agora = Date.now();
  for (const [clave, entrada] of cache.entries()) {
    if (!entrada || entrada.expira <= agora) cache.delete(clave);
  }
  while (cache.size > maximo) cache.delete(cache.keys().next().value);
}

function lerCache(cache, clave) {
  const entrada = cache.get(clave);
  if (!entrada) return null;
  if (entrada.expira <= Date.now()) {
    cache.delete(clave);
    return null;
  }
  return entrada.valor;
}

function gardarCache(cache, clave, valor, duracionMs) {
  cache.set(clave, { valor, expira: Date.now() + duracionMs });
  limparCache(cache);
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

function cacheRequest(request, accion) {
  const url = new URL(request.url);
  url.pathname = '/api/_cache/repertorio';
  url.search = `accion=${encodeURIComponent(accion)}&version=${encodeURIComponent(CACHE_REPERTORIO_VERSION)}`;
  return new Request(url.toString(), { method: 'GET' });
}

async function lerCachePersistente(request, accion, duracionMs) {
  const memoria = lerCache(cacheRespostas, accion);
  if (memoria) return memoria;
  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return null;
  try {
    const response = await cacheApi.match(cacheRequest(request, accion));
    if (!response) return null;
    const resultado = await response.json();
    if (!resultado?.ok) return null;
    gardarCache(cacheRespostas, accion, resultado, duracionMs);
    return resultado;
  } catch (erro) {
    console.warn('Non se puido ler a caché persistente:', erro);
    return null;
  }
}

async function gardarCachePersistente(request, accion, resultado, duracionMs) {
  gardarCache(cacheRespostas, accion, resultado, duracionMs);
  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return;
  try {
    const segundos = Math.max(60, Math.floor(duracionMs / 1000));
    await cacheApi.put(cacheRequest(request, accion), new Response(JSON.stringify(resultado), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${segundos}`,
        'X-SCPP-Cached-At': new Date().toISOString()
      }
    }));
  } catch (erro) {
    console.warn('Non se puido gardar a caché persistente:', erro);
  }
}

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
  const usuarioCacheado = lerCache(cacheTokens, token);
  if (usuarioCacheado) return usuarioCacheado;

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
  gardarCache(cacheTokens, token, resultado, CACHE_TOKEN_MS);
  return resultado;
}

function respostaFicheiroDrive(resultado) {
  const binario = atob(String(resultado.base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const nome = String(resultado.nomeFicheiro || 'ficheiro').replace(/[\r\n"]/g, '');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': String(resultado.mimeType || 'application/octet-stream'),
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'X-SCPP-Storage': 'DRIVE-FALLBACK'
    }
  });
}

function basename(valor) {
  return String(valor || '').trim().replace(/\\/g, '/').split('/').pop() || '';
}

function slugAudio(nome) {
  const punto = nome.lastIndexOf('.');
  const base = punto > 0 ? nome.slice(0, punto) : nome;
  const extension = punto > 0 ? nome.slice(punto).toLowerCase() : '';
  const slug = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${slug}${extension}` : '';
}

function claveR2Valida(valor) {
  const clave = String(valor || '').trim().replace(/^\/+/, '');
  if (!clave || clave.includes('..') || clave.includes('\\')) return '';
  if (!clave.startsWith('repertorio/audios/') && !clave.startsWith('partituras/')) return '';
  return clave;
}

function claveR2Recurso(recurso, tipo, idObra) {
  if (!recurso || typeof recurso !== 'object') return '';

  const explicita = claveR2Valida(
    recurso.r2Key || recurso.R2Key || recurso.r2key || recurso.rutaR2 || recurso.RutaR2
  );
  if (explicita) return explicita;

  const rutaDrive = recurso.ruta || recurso.PDF || recurso.AudioFile || recurso.pdf || recurso.audioFile || '';
  const nome = basename(rutaDrive);
  if (!nome) return '';

  if (tipo === 'partitura') return claveR2Valida(`partituras/${nome}`);

  const obra = String(idObra || recurso.idRepertorio || recurso.Id_Repertorio || recurso.NomeObra || '').trim();
  const nomeR2 = slugAudio(nome);
  return obra && nomeR2 ? claveR2Valida(`repertorio/audios/${obra}/${nomeR2}`) : '';
}

function adaptarRecursosR2(resultado) {
  if (!resultado || typeof resultado !== 'object') return resultado;
  const obras = Array.isArray(resultado.obras)
    ? resultado.obras
    : Array.isArray(resultado.repertorio)
      ? resultado.repertorio
      : [];

  for (const obra of obras) {
    const idObra = String(obra?.id || obra?.Id_Repertorio || obra?.idRepertorio || '').trim();

    const partituras = Array.isArray(obra?.partituras) ? obra.partituras : [];
    for (const recurso of partituras) {
      const clave = claveR2Recurso(recurso, 'partitura', idObra);
      if (clave) {
        recurso.rutaDrive = recurso.ruta || recurso.PDF || recurso.pdf || '';
        recurso.ruta = clave;
        recurso.r2Key = clave;
        recurso.orixe = 'r2';
      }
    }

    const audios = Array.isArray(obra?.audios) ? obra.audios : [];
    for (const recurso of audios) {
      const clave = claveR2Recurso(recurso, 'audio', idObra);
      if (clave) {
        recurso.rutaDrive = recurso.ruta || recurso.AudioFile || recurso.audioFile || '';
        recurso.ruta = clave;
        recurso.r2Key = clave;
        recurso.orixe = 'r2';
      }
    }
  }
  return resultado;
}

async function respostaR2(env, clave) {
  if (!env.R2_PRIVADO) {
    return json(503, { ok: false, erro: 'O almacén privado R2 non está configurado.' });
  }
  const obxecto = await env.R2_PRIVADO.get(clave);
  if (!obxecto) return json(404, { ok: false, erro: 'O ficheiro non aparece no almacén privado.' });

  const nome = (clave.split('/').pop() || 'ficheiro').replace(/[\r\n"]/g, '');
  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream');
  headers.set('Content-Disposition', `inline; filename="${nome}"`);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Storage', 'R2');
  if (obxecto.httpEtag) headers.set('ETag', obxecto.httpEtag);
  return new Response(obxecto.body, { status: 200, headers });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try {
    usuario = await verificarTokenFirebase(String(datos.idToken || '').trim(), env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || 'listarRepertorioPortal').trim();
  if (!['listarRepertorioPortal', 'listarAsistenciasConcertosPortal', 'obterFicheiroRepertorio'].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  if (accion === 'obterFicheiroRepertorio') {
    const clave = claveR2Valida(datos.r2Key || datos.ruta);
    if (clave) {
      try {
        return await respostaR2(env, clave);
      } catch (erro) {
        console.error('Erro ao obter o ficheiro de R2:', erro);
        return json(503, { ok: false, erro: 'Non foi posible abrir o ficheiro desde R2.' });
      }
    }
  }

  const duracionCache = accion === 'listarRepertorioPortal'
    ? CACHE_REPERTORIO_MS
    : accion === 'listarAsistenciasConcertosPortal'
      ? CACHE_ASISTENCIAS_MS
      : 0;

  if (duracionCache) {
    const cacheado = await lerCachePersistente(request, accion, duracionCache);
    if (cacheado) {
      return json(200, adaptarRecursosR2(cacheado), {
        'X-SCPP-Cache': 'HIT',
        'Server-Timing': 'apps-script;dur=0'
      });
    }
  }

  const timeoutMs = accion === 'listarRepertorioPortal'
    ? TIMEOUT_REPERTORIO_MS
    : accion === 'listarAsistenciasConcertosPortal'
      ? TIMEOUT_ASISTENCIAS_MS
      : TIMEOUT_FICHEIRO_MS;

  const inicio = Date.now();
  try {
    const { resultado, usouRespaldo, intento } = await obterJsonAppsScript(
      env,
      {
        token: env.WEB_WRITE_TOKEN,
        accion,
        email: usuario.email,
        uidFirebase: usuario.uid,
        ruta: String(datos.ruta || '').trim()
      },
      {
        timeoutMs,
        attemptTimeoutMs: accion === 'listarRepertorioPortal' ? 18_000 : 12_000
      }
    );

    if (!resultado?.ok) {
      return json(resultado?.erro === 'Usuario non autorizado' ? 403 : 400, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible consultar o repertorio.'
      });
    }

    if (accion === 'obterFicheiroRepertorio') {
      const resposta = respostaFicheiroDrive(resultado);
      if (usouRespaldo) resposta.headers.set('X-SCPP-AppScript', 'FALLBACK');
      return resposta;
    }

    const adaptado = adaptarRecursosR2(resultado);
    if (duracionCache) await gardarCachePersistente(request, accion, adaptado, duracionCache);

    return json(200, adaptado, {
      'X-SCPP-Cache': 'MISS',
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
      'X-SCPP-AppScript-Attempt': String(intento),
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error('Erro no servizo de repertorio:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: accion === 'listarRepertorioPortal'
        ? 'Os audios e ficheiros do repertorio non están dispoñibles neste momento. Os datos básicos poden seguir cargándose.'
        : 'O servizo de repertorio non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
