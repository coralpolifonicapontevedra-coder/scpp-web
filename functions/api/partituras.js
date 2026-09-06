import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { REPERTORIO_R2 } from '../_data/repertorio-r2.js';

const CACHE_MS = 60 * 1000;
const CACHE_TOKEN_MS = 5 * 60 * 1000;
const CACHE_PERMISOS_MS = 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8_000;
const PREFIXO = 'partituras/';

const cacheCatalogo = new Map();
const cacheTokens = new Map();
const cachePermisos = new Map();

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

function limparCatalogo() {
  cacheCatalogo.clear();
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

async function obterNivelPartituras(env, usuario) {
  if (!env.WEB_WRITE_TOKEN) throw new Error('O servizo de permisos non está configurado.');

  const clave = String(usuario?.email || '').trim().toLowerCase();
  const cacheado = lerCache(cachePermisos, clave);
  if (cacheado) return cacheado;

  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'obterPermisosUsuarioPortal',
    email: clave,
    usuarioEmail: clave,
    uidFirebase: String(usuario?.uid || '')
  }, { timeoutMs: 12000, attemptTimeoutMs: 7000 });

  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non foi posible resolver os permisos de Partituras.');
  }

  const nivel = String(resultado?.efectivos?.partituras || 'sen_acceso').trim().toLowerCase();
  const normalizado = ['sen_acceso', 'lectura', 'escritura', 'administracion'].includes(nivel)
    ? nivel
    : 'sen_acceso';
  gardarCache(cachePermisos, clave, normalizado, CACHE_PERMISOS_MS);
  return normalizado;
}

function podeEscribirPartituras(nivel) {
  return ['escritura', 'administracion'].includes(nivel);
}

function truthy(valor) {
  if (valor === true) return true;
  return ['Y', 'SI', 'SÍ', 'TRUE', '1', 'YES'].includes(String(valor ?? '').trim().toUpperCase());
}

function claveValida(valor) {
  const clave = String(valor || '').trim().replace(/^\/+/, '');
  if (!clave || clave.includes('..') || clave.includes('\\')) return '';
  return clave.startsWith(PREFIXO) ? clave : '';
}

function claveDesdeFila(fila) {
  const directa = claveValida(fila?.R2Key);
  if (directa) return directa;
  const pdf = String(fila?.PDF || '').replace(/\\/g, '/').split('/').pop()?.trim() || '';
  return pdf ? claveValida(`${PREFIXO}${pdf}`) : '';
}

function nomeSeguro(valor) {
  return String(valor || 'partitura.pdf')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'partitura.pdf';
}

function bytesDesdeBase64(base64) {
  const binario = atob(String(base64 || ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function catalogoIndiceR2() {
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
        activa: true,
        publica: false,
        estadoMaterial: '',
        r2Key: clave,
        tamano: Number(score?.tamano || 0)
      };
      const actual = porClave.get(clave);
      if (!actual || (!actual.principal && candidato.principal)) porClave.set(clave, candidato);
    }
  }
  const partituras = [...porClave.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'gl', { sensitivity: 'base' }));
  return { ok: true, partituras, total: partituras.length, orixe: 'R2-INDEX-FALLBACK' };
}

async function catalogoPartiturasSheet(env, usuario) {
  const cacheado = lerCache(cacheCatalogo, 'catalogo');
  if (cacheado) return cacheado;
  if (!env.WEB_WRITE_TOKEN) throw new Error('O servizo de consulta non está configurado.');

  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'listarRepertorioAdministracion',
      email: usuario.email,
      usuarioEmail: usuario.email,
      uidFirebase: String(usuario.uid || '')
    }, { timeoutMs: 20000, attemptTimeoutMs: 10000 });

    if (!resultado?.ok || !Array.isArray(resultado.partituras)) {
      throw new Error(resultado?.erro || 'Partituras_App non devolveu un catálogo válido.');
    }

    const partituras = resultado.partituras
      .map((fila) => {
        const r2Key = claveDesdeFila(fila);
        return {
          id: String(fila?.Id_Partitura || fila?.['Row ID'] || r2Key || '').trim(),
          idRepertorio: String(fila?.Id_Repertorio || '').trim(),
          nome: String(fila?.Nomepartitura || 'Partitura').trim(),
          voz: String(fila?.Voz || 'General').trim(),
          tipo: String(fila?.TipoPartitura || '').trim(),
          principal: truthy(fila?.Principal),
          activa: truthy(fila?.Activa),
          publica: truthy(fila?.['Pública']),
          estadoMaterial: String(fila?.EstadoMaterial || '').trim(),
          r2Key,
          tamano: Number(fila?.TamanoR2 || 0)
        };
      })
      .filter((partitura) => partitura.id && partitura.nome && partitura.r2Key)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'gl', { sensitivity: 'base' }));

    const resposta = { ok: true, partituras, total: partituras.length, orixe: 'PARTITURAS_APP' };
    gardarCache(cacheCatalogo, 'catalogo', resposta, CACHE_MS);
    return resposta;
  } catch (erro) {
    console.error('Non foi posible ler Partituras_App; úsase o índice R2 como respaldo:', erro);
    const respaldo = catalogoIndiceR2();
    gardarCache(cacheCatalogo, 'catalogo', respaldo, CACHE_MS);
    return respaldo;
  }
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

async function altaPartitura(env, datos, usuario) {
  if (!env.WEB_WRITE_TOKEN) return json(500, { ok: false, erro: 'A escritura non está configurada.' });
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') {
    return json(503, { ok: false, erro: 'O almacén privado R2 non está configurado.' });
  }

  const nome = String(datos.nomepartitura || '').trim();
  const ficheiro = datos.ficheiro || {};
  if (!nome) return json(400, { ok: false, erro: 'Indica o nome da partitura.' });
  if (!String(ficheiro.base64 || '')) return json(400, { ok: false, erro: 'Selecciona un ficheiro PDF.' });
  if (String(ficheiro.mimeType || '').toLowerCase() !== 'application/pdf') {
    return json(400, { ok: false, erro: 'O ficheiro debe ser PDF.' });
  }

  const nomeFicheiro = nomeSeguro(ficheiro.nome || `${nome}.pdf`);
  const clave = `${PREFIXO}${Date.now()}-${nomeFicheiro}`;
  const bytes = bytesDesdeBase64(ficheiro.base64);
  await env.R2_PRIVADO.put(clave, bytes, {
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, max-age=3600' }
  });

  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'altaPartituraPortal',
      correo: usuario.email,
      Id_Repertorio: String(datos.idRepertorio || '').trim(),
      Nomepartitura: nome,
      Voz: String(datos.voz || 'General').trim(),
      'Versión': String(datos.version || '1.0').trim(),
      PDF: `Partituras_Files_/${nomeFicheiro}`,
      'Pública': datos.publica === true,
      Activa: true,
      'Observacións': String(datos.observacions || '').trim(),
      TipoPartitura: String(datos.tipoPartitura || 'Coral').trim(),
      Principal: datos.principal !== false,
      R2Key: clave,
      EstadoR2: 'Verificado',
      DataSubidaR2: new Date().toISOString(),
      TamanoR2: bytes.byteLength,
      MimeType: 'application/pdf'
    }, { timeoutMs: 30000 });

    if (!resultado?.ok) throw new Error(resultado?.erro || 'Non foi posible rexistrar a partitura na folla.');
    limparCatalogo();
    return json(200, { ok: true, r2Key: clave, idPartitura: resultado.idPartitura || '' });
  } catch (erro) {
    await env.R2_PRIVADO.delete(clave).catch(() => {});
    throw erro;
  }
}

async function eliminarPartitura(env, datos, usuario) {
  if (!env.WEB_WRITE_TOKEN) return json(500, { ok: false, erro: 'A escritura non está configurada.' });
  const idPartitura = String(datos.idPartitura || '').trim();
  if (!idPartitura) return json(400, { ok: false, erro: 'Selecciona a partitura que queres eliminar.' });

  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'eliminarPartituraPortal',
    correo: usuario.email,
    idPartitura
  }, { timeoutMs: 30000 });
  if (!resultado?.ok) return json(400, { ok: false, erro: resultado?.erro || 'Non foi posible eliminar a partitura.' });
  limparCatalogo();
  return json(200, { ok: true, idPartitura });
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
  const accionsLectura = new Set(['listarPartiturasPortal', 'obterFicheiroPartitura']);
  const accionsEscritura = new Set(['altaPartituraPortal', 'eliminarPartituraPortal']);

  if (!accionsLectura.has(accion) && !accionsEscritura.has(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  if (accionsEscritura.has(accion)) {
    let nivelPermiso;
    try {
      nivelPermiso = await obterNivelPartituras(env, usuario);
    } catch (erro) {
      console.error('Erro ao comprobar permisos de Partituras:', erro);
      return json(503, { ok: false, erro: 'Non foi posible comprobar os permisos de Partituras.' });
    }

    if (!podeEscribirPartituras(nivelPermiso)) {
      return json(403, { ok: false, erro: 'Non tes permiso de escritura para Partituras.' });
    }
  }

  if (accion === 'listarPartiturasPortal') {
    try {
      const resultado = await catalogoPartiturasSheet(env, usuario);
      return json(200, resultado, {
        'X-SCPP-Storage': resultado.orixe || 'PARTITURAS_APP',
        'Server-Timing': 'partituras;dur=1'
      });
    } catch (erro) {
      console.error('Erro ao listar Partituras:', erro);
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

  if (accion === 'altaPartituraPortal') {
    try {
      return await altaPartitura(env, datos, usuario);
    } catch (erro) {
      console.error('Erro na alta de Partitura:', erro);
      return json(503, { ok: false, erro: erro instanceof Error ? erro.message : 'Non foi posible dar de alta a partitura.' });
    }
  }

  if (accion === 'eliminarPartituraPortal') {
    try {
      return await eliminarPartitura(env, datos, usuario);
    } catch (erro) {
      console.error('Erro ao eliminar Partitura:', erro);
      return json(503, { ok: false, erro: erro instanceof Error ? erro.message : 'Non foi posible eliminar a partitura.' });
    }
  }

  return json(400, { ok: false, erro: 'Acción non permitida' });
}
