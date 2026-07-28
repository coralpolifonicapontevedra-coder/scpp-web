const CACHE_DOCUMENTACION_MS = 30 * 60 * 1000;
const CACHE_TOKEN_MS = 5 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8 * 1000;
const TIMEOUT_LISTADO_MS = 22 * 1000;
const TIMEOUT_FICHEIRO_MS = 35 * 1000;

const cacheTokens = new Map();
const cacheDocumentacion = new Map();

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

function lerCache(cache, clave, permitirCaducada = false) {
  const entrada = cache.get(clave);
  if (!entrada) return null;
  if (entrada.expira <= Date.now() && !permitirCaducada) return null;
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

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;

  const cacheado = lerCache(cacheTokens, token);
  if (cacheado) return cacheado;

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

function normalizarTexto(valor = '') {
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizarDocumento(documento = {}) {
  const item = { ...documento };
  const clase = normalizarTexto(item.clase);
  const nivel = normalizarTexto(item.nivel);
  const texto = normalizarTexto([
    item.titulo,
    item.tipo,
    item.descricion,
    item.observacions,
    item.organismo
  ].filter(Boolean).join(' '));

  if (clase === 'acta' || item.organo) {
    item.seccion = 'actas';
  } else if (nivel === 'administracion') {
    item.seccion = 'administracion';
  } else if ([
    'balance',
    'conta de resultados',
    'contas anuais',
    'transparencia',
    'informacion economica',
    'memoria economica',
    'orzamento'
  ].some((termo) => texto.includes(termo))) {
    item.seccion = 'transparencia';
  } else {
    item.seccion = 'xeral';
  }

  return item;
}

function normalizarResultado(resultado, usuario) {
  const documentos = Array.isArray(resultado?.documentos)
    ? resultado.documentos
        .map(normalizarDocumento)
        .filter((item) => item && item.ruta && (item.titulo || item.organo || item.tipo))
    : [];

  const perfilOrixinal = resultado?.perfil || resultado?.usuario || {};
  const perfil = {
    ...perfilOrixinal,
    email: String(perfilOrixinal.email || usuario.email || '').trim().toLowerCase(),
    nivel: String(perfilOrixinal.nivel || resultado?.nivel || 'Coralistas').trim()
  };

  return {
    ok: true,
    perfil,
    nivel: perfil.nivel,
    documentos
  };
}

function cacheRequest(request, email) {
  const url = new URL(request.url);
  url.pathname = '/api/_cache/documentacion';
  url.search = `usuario=${encodeURIComponent(email)}`;
  return new Request(url.toString(), { method: 'GET' });
}

async function lerCachePersistente(request, email) {
  const memoria = lerCache(cacheDocumentacion, email);
  if (memoria) return memoria;

  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return null;
  try {
    const resposta = await cacheApi.match(cacheRequest(request, email));
    if (!resposta) return null;
    const resultado = await resposta.json();
    if (!resultado?.ok || !Array.isArray(resultado.documentos) || !resultado.documentos.length) return null;
    gardarCache(cacheDocumentacion, email, resultado, CACHE_DOCUMENTACION_MS);
    return resultado;
  } catch (erro) {
    console.warn('Non se puido ler a caché de documentación:', erro);
    return null;
  }
}

async function gardarCachePersistente(request, email, resultado) {
  if (!resultado?.ok || !Array.isArray(resultado.documentos) || !resultado.documentos.length) return;
  gardarCache(cacheDocumentacion, email, resultado, CACHE_DOCUMENTACION_MS);

  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return;
  try {
    const resposta = new Response(JSON.stringify(resultado), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${Math.floor(CACHE_DOCUMENTACION_MS / 1000)}`,
        'X-SCPP-Cached-At': new Date().toISOString()
      }
    });
    await cacheApi.put(cacheRequest(request, email), resposta);
  } catch (erro) {
    console.warn('Non se puido gardar a caché de documentación:', erro);
  }
}

function respostaFicheiro(resultado) {
  const binario = atob(String(resultado.base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const nome = String(resultado.nomeFicheiro || 'documento.pdf').replace(/[\r\n"]/g, '');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': String(resultado.mimeType || 'application/pdf'),
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function chamarAppsScript(env, usuario, accion, datos, timeoutMs) {
  const resposta = await fetchConTempoLimite(
    env.APPS_SCRIPT_WEBAPP_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: env.WEB_WRITE_TOKEN,
        accion,
        email: usuario.email,
        uidFirebase: usuario.uid,
        ruta: String(datos.ruta || '').trim(),
        clase: String(datos.clase || '').trim()
      })
    },
    timeoutMs
  );

  if (!resposta.ok) throw new Error(`Apps Script respondeu con HTTP ${resposta.status}`);
  const texto = await resposta.text();
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error('O servizo devolveu unha resposta non válida');
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.APPS_SCRIPT_WEBAPP_URL || !env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'Falta a configuración segura do servizo' });
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
  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const accion = String(datos.accion || 'listarDocumentacionPortal').trim();
  if (!['listarDocumentacionPortal', 'obterFicheiroDocumentacion'].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  if (accion === 'listarDocumentacionPortal') {
    const cacheado = await lerCachePersistente(request, usuario.email);
    if (cacheado) {
      return json(200, cacheado, {
        'X-SCPP-Cache': 'HIT',
        'Server-Timing': 'apps-script;dur=0'
      });
    }
  }

  const inicio = Date.now();
  try {
    const resultadoAppsScript = await chamarAppsScript(
      env,
      usuario,
      accion,
      datos,
      accion === 'listarDocumentacionPortal' ? TIMEOUT_LISTADO_MS : TIMEOUT_FICHEIRO_MS
    );

    if (!resultadoAppsScript?.ok) {
      const status = resultadoAppsScript?.erro === 'Usuario non autorizado' ? 403 : 400;
      return json(status, resultadoAppsScript || { ok: false, erro: 'Resposta baleira do servizo' });
    }

    if (accion === 'obterFicheiroDocumentacion') return respostaFicheiro(resultadoAppsScript);

    const resultado = normalizarResultado(resultadoAppsScript, usuario);
    if (!resultado.documentos.length) {
      const anterior = lerCache(cacheDocumentacion, usuario.email, true);
      if (anterior?.documentos?.length) {
        return json(200, anterior, {
          'X-SCPP-Cache': 'STALE',
          'X-SCPP-Warning': 'empty-upstream-response'
        });
      }
      return json(502, {
        ok: false,
        erro: 'O servizo respondeu sen documentos, aínda que a folla contén rexistros. Tenta de novo nuns segundos.'
      });
    }

    await gardarCachePersistente(request, usuario.email, resultado);
    return json(200, resultado, {
      'X-SCPP-Cache': 'MISS',
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error(erro);
    const anterior = accion === 'listarDocumentacionPortal'
      ? lerCache(cacheDocumentacion, usuario.email, true)
      : null;
    if (anterior?.documentos?.length) {
      return json(200, anterior, {
        'X-SCPP-Cache': 'STALE',
        'X-SCPP-Warning': 'upstream-error'
      });
    }
    if (erro instanceof Error && erro.name === 'AbortError') {
      return json(504, {
        ok: false,
        erro: 'O servizo de documentación tardou demasiado en responder. Tenta de novo nuns segundos.'
      });
    }
    return json(502, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non foi posible contactar co servizo de documentación'
    });
  }
}
