import { obterJsonAppsScript } from '../_lib/apps-script.js';

const APPS_SCRIPT_PRODUCION = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const APPS_SCRIPT_PREVIEW = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const clean = (value) => String(value || '').trim();

function ramaActual(env) {
  return String(env.CF_PAGES_BRANCH || '').trim() === 'main' ? 'main' : 'preview';
}

function claveCacheListado(env) {
  return `repertorio/cache/administracion/${ramaActual(env)}/listado-v2.json`;
}

async function lerCacheListado(env, permitirCaducado = false) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(claveCacheListado(env));
  if (!object) return null;
  const cache = await object.json().catch(() => null);
  if (!cache?.payload?.ok) return null;
  const gardadoEn = Number(cache.gardadoEn) || 0;
  if (!permitirCaducado && (!gardadoEn || Date.now() - gardadoEn > CACHE_TTL_MS)) return null;
  return { payload: cache.payload, gardadoEn };
}

async function gardarCacheListado(env, payload) {
  if (!payload?.ok || !env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return;
  await env.R2_PRIVADO.put(
    claveCacheListado(env),
    JSON.stringify({ gardadoEn: Date.now(), payload }),
    { httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } }
  );
}

async function invalidarCacheListado(env) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.delete !== 'function') return;
  await env.R2_PRIVADO.delete(claveCacheListado(env));
}

function valorCacheSheet(key, value) {
  if ((key === 'Principal' || key === 'Pública' || key === 'Activa' || key === 'Activo') && typeof value === 'boolean') {
    return value ? 'Y' : 'N';
  }
  return value;
}

async function actualizarCacheTrasEscritura(env, accion, body) {
  const cache = await lerCacheListado(env, true);
  if (!cache?.payload) return;

  const payload = cache.payload;
  let fila = null;

  if (accion === 'actualizarPartituraRepertorioAdministracion') {
    fila = Array.isArray(payload.partituras)
      ? payload.partituras.find((item) => clean(item?.Id_Partitura) === clean(body.id))
      : null;
  } else if (accion === 'actualizarObraRepertorioAdministracion') {
    fila = Array.isArray(payload.obras)
      ? payload.obras.find((item) => clean(item?.Id) === clean(body.id))
      : null;
  } else if (accion === 'actualizarAudioRepertorioAdministracion') {
    fila = Array.isArray(payload.audios)
      ? payload.audios.find((item) => clean(item?.Id_Audio) === clean(body.id))
      : null;
  }

  if (fila && body?.datos && typeof body.datos === 'object') {
    for (const [key, value] of Object.entries(body.datos)) fila[key] = valorCacheSheet(key, value);
    await gardarCacheListado(env, payload);
    return;
  }

  if (accion === 'estadoRecursoRepertorioAdministracion') {
    const tipo = clean(body.tipo);
    const lista = tipo === 'partitura' ? payload.partituras : payload.audios;
    const campoId = tipo === 'partitura' ? 'Id_Partitura' : 'Id_Audio';
    const campoEstado = tipo === 'partitura' ? 'Activa' : 'Activo';
    const recurso = Array.isArray(lista)
      ? lista.find((item) => clean(item?.[campoId]) === clean(body.id))
      : null;
    if (recurso) {
      recurso[campoEstado] = body.activo === true ? 'Y' : 'N';
      await gardarCacheListado(env, payload);
      return;
    }
  }

  await invalidarCacheListado(env);
}

async function verificarFirebase(token, apiKey) {
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  return user?.email && user.emailVerified
    ? { uid: clean(user.localId), email: clean(user.email).toLowerCase() }
    : null;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function eAdministrador(env, user) {
  const object = await env.R2_PRIVADO?.get?.(`persoas/cache/administracion/${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const data = await object.json().catch(() => null);
  return data?.administrador === user.email && data?.payload?.perfil?.nivel === 'Administración';
}

function urlRepertorioAdministracion(env) {
  return ramaActual(env) === 'main' ? APPS_SCRIPT_PRODUCION : APPS_SCRIPT_PREVIEW;
}

const ACCIONS = new Set([
  'listarRepertorioAdministracion',
  'diagnosticoRepertorioAdministracion',
  'altaObraRepertorioAdministracion',
  'altaAudioRepertorioAdministracion',
  'altaPartituraRepertorioAdministracion',
  'estadoRecursoRepertorioAdministracion',
  'actualizarObraRepertorioAdministracion',
  'actualizarPartituraRepertorioAdministracion',
  'actualizarAudioRepertorioAdministracion'
]);

const ACCIONS_ESCRITURA = new Set([
  'altaObraRepertorioAdministracion',
  'altaAudioRepertorioAdministracion',
  'altaPartituraRepertorioAdministracion',
  'estadoRecursoRepertorioAdministracion',
  'actualizarObraRepertorioAdministracion',
  'actualizarPartituraRepertorioAdministracion',
  'actualizarAudioRepertorioAdministracion'
]);

async function chamar(env, user, accion, body) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    email: user.email,
    uidFirebase: user.uid,
    accion,
    ...body
  }, {
    timeoutMs: 30000,
    attemptTimeoutMs: 12000,
    urlOverride: urlRepertorioAdministracion(env)
  });
  return resultado;
}

function nomeSeguro(valor) {
  return clean(valor || 'partitura.pdf')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'partitura.pdf';
}

function bytesDesdeBase64(base64) {
  const texto = clean(base64).replace(/^data:application\/pdf;base64,/i, '');
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function altaPartituraAdministracion(env, user, body) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') {
    return { ok: false, codigo: 'R2_NOT_CONFIGURED', erro: 'O almacén privado R2 non está configurado.' };
  }

  const partitura = body?.partitura || {};
  const ficheiro = body?.ficheiro || {};
  const nome = clean(partitura.Nomepartitura || partitura.nomepartitura);
  const mimeType = clean(ficheiro.mimeType).toLowerCase();
  if (!nome) return { ok: false, codigo: 'VALIDATION', erro: 'Indica o nome da partitura.' };
  if (!clean(ficheiro.base64)) return { ok: false, codigo: 'VALIDATION', erro: 'Selecciona un ficheiro PDF.' };
  if (mimeType && mimeType !== 'application/pdf') {
    return { ok: false, codigo: 'VALIDATION', erro: 'O ficheiro debe ser PDF.' };
  }

  let bytes;
  try { bytes = bytesDesdeBase64(ficheiro.base64); }
  catch { return { ok: false, codigo: 'INVALID_PDF', erro: 'Non foi posible ler o ficheiro PDF.' }; }
  if (!bytes.byteLength) return { ok: false, codigo: 'EMPTY_PDF', erro: 'O ficheiro PDF está baleiro.' };
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { ok: false, codigo: 'PDF_TOO_LARGE', erro: 'O PDF supera o límite de 20 MB.' };
  }
  if (bytes.byteLength < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    return { ok: false, codigo: 'INVALID_PDF', erro: 'O ficheiro seleccionado non parece un PDF válido.' };
  }

  const nomeFicheiro = nomeSeguro(ficheiro.nome || `${nome}.pdf`);
  const clave = `partituras/${Date.now()}-${crypto.randomUUID()}-${nomeFicheiro}`;
  await env.R2_PRIVADO.put(clave, bytes, {
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, max-age=3600' }
  });

  try {
    const resultado = await chamar(env, user, 'altaPartituraPortal', {
      Id_Repertorio: clean(partitura.Id_Repertorio || partitura.idRepertorio),
      Nomepartitura: nome,
      Voz: clean(partitura.Voz || partitura.voz) || 'General',
      'Versión': clean(partitura['Versión'] || partitura.version) || '1.0',
      PDF: `Partituras_Files_/${nomeFicheiro}`,
      'Pública': partitura['Pública'] === true || partitura.publica === true,
      Activa: true,
      'Observacións': clean(partitura['Observacións'] || partitura.observacions),
      TipoPartitura: clean(partitura.TipoPartitura || partitura.tipoPartitura) || 'Coral',
      Principal: partitura.Principal === true || partitura.principal === true,
      R2Key: clave,
      EstadoR2: 'Verificado',
      DataSubidaR2: new Date().toISOString(),
      TamanoR2: bytes.byteLength,
      MimeType: 'application/pdf'
    });
    if (!resultado?.ok) throw new Error(resultado?.erro || 'Non foi posible rexistrar a partitura en Partituras_App.');
    return { ok: true, idPartitura: clean(resultado.idPartitura), r2Key: clave, tamano: bytes.byteLength };
  } catch (error) {
    await env.R2_PRIVADO.delete(clave).catch(() => {});
    throw error;
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, erro: 'Solicitude non válida.' }); }

  const user = await verificarFirebase(clean(body.idToken), env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida.' });
  if (!(await eAdministrador(env, user))) return json(403, { ok: false, erro: 'Só Administración pode xestionar o repertorio.' });

  const accion = clean(body.accion);
  if (!ACCIONS.has(accion)) return json(400, { ok: false, erro: 'Acción non permitida.' });

  try {
    if (accion === 'listarRepertorioAdministracion') {
      const cache = await lerCacheListado(env);
      if (cache?.payload) {
        return json(200, {
          ...cache.payload,
          cache: { orixe: 'r2', idadeMs: Math.max(0, Date.now() - cache.gardadoEn) }
        });
      }

      const resultadoLista = await chamar(env, user, accion, body);
      if (resultadoLista?.ok) {
        await gardarCacheListado(env, resultadoLista).catch(() => {});
        return json(200, { ...resultadoLista, cache: { orixe: 'apps-script', idadeMs: 0 } });
      }

      let diagnostico = null;
      try { diagnostico = await chamar(env, user, 'diagnosticoRepertorioAdministracion', {}); } catch (e) {
        diagnostico = { ok: false, erro: e instanceof Error ? e.message : String(e) };
      }
      return json(502, {
        ok: false,
        codigo: resultadoLista?.codigo || 'REPERTORIO_ADMIN_LIST_ERROR',
        erro: resultadoLista?.erro || diagnostico?.erro || 'Non foi posible completar a operación.',
        diagnostico: resultadoLista?.diagnostico || diagnostico?.probas || diagnostico
      });
    }

    if (accion === 'altaPartituraRepertorioAdministracion') {
      const resultadoAlta = await altaPartituraAdministracion(env, user, body);
      if (resultadoAlta?.ok) await invalidarCacheListado(env).catch(() => {});
      return json(resultadoAlta?.ok ? 200 : 400, resultadoAlta);
    }

    const resultado = await chamar(env, user, accion, body);
    if (resultado?.ok) {
      if (ACCIONS_ESCRITURA.has(accion)) {
        await actualizarCacheTrasEscritura(env, accion, body).catch(async () => {
          await invalidarCacheListado(env).catch(() => {});
        });
      }
      return json(200, resultado);
    }

    return json(502, resultado || { ok: false, erro: 'Resposta baleira.' });
  } catch (error) {
    return json(502, {
      ok: false,
      codigo: error?.code || 'REPERTORIO_ADMIN_TRANSPORT_ERROR',
      erro: error instanceof Error ? error.message : 'Non foi posible acceder á administración do repertorio.',
      detalle: String(error?.stack || '')
    });
  }
}
