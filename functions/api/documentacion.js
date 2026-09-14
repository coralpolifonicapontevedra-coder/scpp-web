import { comprobarLecturaPortal } from '../_lib/portal-permissions.js';
import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_TOKEN_MS = 5 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8 * 1000;
const TIMEOUT_LISTADO_MS = 22 * 1000;
const TIMEOUT_FICHEIRO_MS = 60 * 1000;
const TIMEOUT_INTENTO_FICHEIRO_MS = 40 * 1000;

const cacheTokens = new Map();

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

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

  return { ok: true, perfil, nivel: perfil.nivel, documentos };
}

function respostaFicheiro(resultado) {
  const base64 = String(resultado.base64 || '');
  if (!base64) return json(502, { ok: false, erro: 'O documento chegou baleiro.' });

  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const nome = String(resultado.nomeFicheiro || 'documento.pdf').replace(/[\r\n"]/g, '');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': String(resultado.mimeType || 'application/pdf'),
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-SCPP-Storage': 'DRIVE_APPS_SCRIPT'
    }
  });
}

function nomeSeguro(valor) {
  return String(valor || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\r\n"]/g, '');
}

function slugR2(valor) {
  const slug = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug || 'arquivo';
}

function claveR2Documento(documento) {
  const id = String(documento?.id || '').trim();
  const nome = nomeSeguro(documento?.ruta);
  if (!id || !nome) return '';
  const prefixo = documento?.clase === 'acta'
    ? 'documentacion/actas'
    : 'documentacion/documentos';
  return `${prefixo}/${slugR2(id)}-${slugR2(nome)}`;
}

function buscarDocumentoAutorizado(payload, datos) {
  const ruta = String(datos?.ruta || '').trim();
  const clase = String(datos?.clase || '').trim();
  if (!ruta || !clase || !Array.isArray(payload?.documentos)) return null;
  return payload.documentos.find(
    (item) => String(item?.ruta || '').trim() === ruta
      && String(item?.clase || '').trim() === clase
  ) || null;
}

async function listadoAutorizado(context, usuario, datos) {
  const { normalizado } = await consultarListado(context.env, usuario, datos);
  return normalizado;
}

async function respostaR2(env, documento) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const key = claveR2Documento(documento);
  if (!key || !key.startsWith('documentacion/')) return null;

  const inicio = Date.now();
  const object = await env.R2_PRIVADO.get(key);
  if (!object) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const nome = nomeSeguro(documento.ruta) || key.split('/').pop() || 'documento.pdf';
  headers.set('Content-Type', headers.get('Content-Type') || 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${nome}"`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Storage', 'R2');
  headers.set('Server-Timing', `r2;dur=${Date.now() - inicio}`);
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

function corpoAppsScript(env, usuario, accion, datos) {
  return {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: usuario.email,
    uidFirebase: usuario.uid,
    ruta: String(datos.ruta || '').trim(),
    clase: String(datos.clase || '').trim()
  };
}

async function consultarListado(env, usuario, datos) {
  const { resultado, usouRespaldo, intento } = await obterJsonAppsScript(
    env,
    corpoAppsScript(env, usuario, 'listarDocumentacionPortal', datos),
    { timeoutMs: TIMEOUT_LISTADO_MS }
  );

  if (!resultado?.ok) {
    const erro = new Error(resultado?.erro || 'Non foi posible consultar a documentación.');
    erro.status = resultado?.erro === 'Usuario non autorizado' ? 403 : 400;
    throw erro;
  }

  const normalizado = normalizarResultado(resultado, usuario);

  return { normalizado, usouRespaldo, intento };
}

export async function onRequest(context) {
  const { request, env } = context;
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

  const accion = String(datos.accion || 'listarDocumentacionPortal').trim();
  if (!['listarDocumentacionPortal', 'obterFicheiroDocumentacion'].includes(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  try {
    if (!(await comprobarLecturaPortal(env, usuario, 'documentacion', { fresco: true }))) {
      return json(403, { ok: false, erro: 'Non tes permiso para consultar a documentación.' });
    }
  } catch {
    return json(503, { ok: false, erro: 'Non foi posible comprobar os permisos de documentación.' });
  }

  const inicio = Date.now();
  try {
    if (accion === 'obterFicheiroDocumentacion') {
      const payload = await listadoAutorizado(context, usuario, datos);
      const documento = buscarDocumentoAutorizado(payload, datos);
      if (!documento) {
        return json(403, {
          ok: false,
          erro: 'Non tes permiso para acceder a este documento.'
        });
      }

      try {
        const respostaDirecta = await respostaR2(env, documento);
        if (respostaDirecta) return respostaDirecta;
      } catch (erroR2) {
        console.warn('Non se puido servir o documento desde R2; úsase o respaldo:', erroR2);
      }

      // Respaldo temporal: conserva Drive a través de Apps Script durante a transición.
      const { resultado, usouRespaldo } = await obterJsonAppsScript(
        env,
        corpoAppsScript(env, usuario, accion, datos),
        {
          timeoutMs: TIMEOUT_FICHEIRO_MS,
          attemptTimeoutMs: TIMEOUT_INTENTO_FICHEIRO_MS
        }
      );
      if (!resultado?.ok) {
        return json(resultado?.erro === 'Usuario non autorizado' ? 403 : 400, {
          ok: false,
          erro: resultado?.erro || 'Non foi posible abrir o documento.'
        });
      }
      const resposta = respostaFicheiro(resultado);
      resposta.headers.set('X-SCPP-R2', 'FALLBACK');
      if (usouRespaldo) resposta.headers.set('X-SCPP-AppScript', 'FALLBACK');
      return resposta;
    }

    const { normalizado, usouRespaldo, intento } = await consultarListado(env, usuario, datos);
    return json(200, normalizado, {
      'X-SCPP-Cache': 'MISS',
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
      'X-SCPP-AppScript-Attempt': String(intento),
      'Server-Timing': `apps-script;dur=${Date.now() - inicio}`
    });
  } catch (erro) {
    console.error('Erro de documentación:', erro);
    const status = Number(erro?.status) || (erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503);
    return json(status, {
      ok: false,
      erro: status === 403
        ? 'Non tes permiso para acceder a esta documentación.'
        : 'O servizo de documentación non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
