import { REPERTORIO_R2 } from '../_data/repertorio-r2.js';

const CACHE_MS = 10 * 60 * 1000;
const CACHE_TOKEN_MS = 5 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8_000;
const PREFIXO = 'partituras/';

const cacheCatalogo = new Map();
const cacheTokens = new Map();

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

function lerCache(cache, clave) {
  const entrada = cache.get(clave);
  if (!entrada || entrada.expira <= Date.now()) {
    if (entrada) cache.delete(clave);
    return null;
  }
  return entrada.valor;
}

function gardarCache(cache, clave, valor, duracionMs) {
  cache.set(clave, { valor, expira: Date.now() + duracionMs });
  while (cache.size > 100) cache.delete(cache.keys().next().value);
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

function claveValida(valor) {
  const clave = String(valor || '').trim().replace(/^\/+/, '');
  if (!clave || clave.includes('..') || clave.includes('\\')) return '';
  return clave.startsWith(PREFIXO) ? clave : '';
}

function catalogoActivo() {
  const cacheado = lerCache(cacheCatalogo, 'catalogo');
  if (cacheado) return cacheado;

  const porClave = new Map();
  for (const [idRepertorio, recursos] of Object.entries(REPERTORIO_R2 || {})) {
    for (const score of recursos?.partituras || []) {
      const clave = claveValida(score?.r2Key || score?.ruta);
      if (!clave) continue;
      const candidato = {
        id: String(score?.id || clave),
        idRepertorio: String(idRepertorio || ''),
        nome: String(score?.nome || 'Partitura').trim(),
        voz: String(score?.voz || 'General').trim(),
        tipo: String(score?.tipo || '').trim(),
        principal: score?.principal === true,
        r2Key: clave,
        tamano: Number(score?.tamano || 0)
      };
      const actual = porClave.get(clave);
      if (!actual || (!actual.principal && candidato.principal)) porClave.set(clave, candidato);
    }
  }

  const partituras = [...porClave.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'gl', { sensitivity: 'base' }));
  const resultado = { ok: true, partituras, total: partituras.length, orixe: 'R2-INDEX' };
  gardarCache(cacheCatalogo, 'catalogo', resultado, CACHE_MS);
  return resultado;
}

async function obterFicheiro(env, clave) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') {
    return json(503, { ok: false, erro: 'O almacén privado R2 non está configurado.' });
  }
  const obxecto = await env.R2_PRIVADO.get(clave);
  if (!obxecto) return json(404, { ok: false, erro: 'A partitura non aparece no almacén privado.' });

  const nome = (clave.split('/').pop() || 'partitura.pdf').replace(/[\r\n"]/g, '');
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

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try {
    usuario = await verificarTokenFirebase(datos.idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase en Partituras:', erro);
  }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || 'listarPartiturasPortal').trim();
  if (accion === 'listarPartiturasPortal') {
    try {
      const resultado = catalogoActivo();
      return json(200, resultado, { 'X-SCPP-Storage': 'R2-INDEX', 'Server-Timing': 'r2-index;dur=1' });
    } catch (erro) {
      console.error('Erro ao listar Partituras desde o índice R2:', erro);
      return json(503, { ok: false, erro: 'Non foi posible cargar o arquivo de partituras.' });
    }
  }

  if (accion === 'obterFicheiroPartitura') {
    const clave = claveValida(datos.r2Key || datos.ruta);
    if (!clave) return json(400, { ok: false, erro: 'Ruta de partitura non válida.' });
    try {
      return await obterFicheiro(env, clave);
    } catch (erro) {
      console.error('Erro ao abrir Partitura desde R2:', erro);
      return json(503, { ok: false, erro: 'Non foi posible abrir a partitura.' });
    }
  }

  return json(400, { ok: false, erro: 'Acción non permitida' });
}
