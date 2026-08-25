import { obterJsonAppsScript } from '../_lib/apps-script.js';

const PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org';
const BATCH_SIZE = 40;
const ADMIN_TTL_MS = 10 * 60 * 1000;
const adminCache = new Map();

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const texto = (valor) => String(valor ?? '').trim();

async function verificarToken(idToken, apiKey) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: texto(idToken) })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  return user?.email && user.emailVerified === true
    ? { uid: texto(user.localId), email: texto(user.email).toLowerCase() }
    : null;
}

async function comprobarAdministracion(env, usuario) {
  const cacheada = adminCache.get(usuario.email);
  if (cacheada && Date.now() - cacheada < ADMIN_TTL_MS) return true;

  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'comprobarFotosAdministracionPortal',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 30_000, attemptTimeoutMs: 12_000 });

  if (!resultado?.ok || resultado?.administrador !== true) {
    throw new Error(resultado?.erro || 'Administración non autorizada');
  }
  adminCache.set(usuario.email, Date.now());
  return true;
}

function buckets(env, tipo) {
  if (tipo === 'publico') {
    return { orixe: env.R2_PUBLICO, destino: env.R2_PUBLICO_PREVIEW, etiqueta: 'público' };
  }
  if (tipo === 'privado') {
    return { orixe: env.R2_PRIVADO, destino: env.R2_PRIVADO_PREVIEW, etiqueta: 'privado' };
  }
  throw new Error('Tipo de bucket non válido');
}

async function comprobarIllamento(orixe, destino, tipo) {
  const clave = `__preview_migration_probe/${tipo}-${crypto.randomUUID()}.json`;
  const contido = JSON.stringify({ tipo, creadoEn: new Date().toISOString() });
  await destino.put(clave, contido, {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
    customMetadata: { scppPreviewProbe: 'true' }
  });

  try {
    const visibleNoOrixe = Boolean(await orixe.head(clave));
    if (visibleNoOrixe) {
      return { illado: false, erro: 'O bucket de destino e o de orixe son o mesmo recurso físico.' };
    }
    return { illado: true };
  } finally {
    await destino.delete(clave).catch(() => {});
  }
}

async function mapLimit(items, limit, fn) {
  const resultados = new Array(items.length);
  let seguinte = 0;
  async function worker() {
    while (true) {
      const i = seguinte++;
      if (i >= items.length) return;
      try {
        resultados[i] = await fn(items[i]);
      } catch (error) {
        resultados[i] = {
          ok: false,
          clave: items[i]?.key || '',
          erro: error instanceof Error ? error.message : 'Erro de copia'
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return resultados;
}

async function copiarObxecto(orixe, destino, item, tipo) {
  const destinoActual = await destino.head(item.key);
  if (
    destinoActual &&
    destinoActual.size === item.size &&
    texto(destinoActual.customMetadata?.previewCloneSourceEtag) === texto(item.etag)
  ) {
    return { ok: true, clave: item.key, copiado: false, omitido: true, bytes: item.size };
  }

  const source = await orixe.get(item.key);
  if (!source) throw new Error(`O obxecto desapareceu do bucket de orixe: ${item.key}`);

  const customMetadata = {
    ...(source.customMetadata || {}),
    previewClone: 'true',
    previewCloneTipo: tipo,
    previewCloneSourceEtag: texto(source.etag),
    previewCloneAt: new Date().toISOString()
  };

  await destino.put(item.key, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata
  });

  const verificado = await destino.head(item.key);
  if (!verificado || verificado.size !== source.size) {
    throw new Error(`A verificación de tamaño fallou para ${item.key}`);
  }

  return { ok: true, clave: item.key, copiado: true, omitido: false, bytes: source.size };
}

async function copiarLote(orixe, destino, tipo, cursor) {
  const listado = await orixe.list({ limit: BATCH_SIZE, cursor: cursor || undefined });
  const resultados = await mapLimit(listado.objects || [], 4, (item) => copiarObxecto(orixe, destino, item, tipo));
  const fallos = resultados.filter((item) => !item?.ok);
  return {
    ok: fallos.length === 0,
    procesados: resultados.length,
    copiados: resultados.filter((item) => item?.copiado).length,
    omitidos: resultados.filter((item) => item?.omitido).length,
    bytes: resultados.filter((item) => item?.ok).reduce((total, item) => total + Number(item.bytes || 0), 0),
    fallos: fallos.slice(0, 5),
    cursor: listado.truncated ? listado.cursor : '',
    truncated: listado.truncated === true
  };
}

async function verificarLote(orixe, destino, cursor) {
  const listado = await orixe.list({ limit: BATCH_SIZE, cursor: cursor || undefined });
  const resultados = await mapLimit(listado.objects || [], 8, async (item) => {
    const target = await destino.head(item.key);
    const coincide = Boolean(
      target &&
      target.size === item.size &&
      texto(target.customMetadata?.previewCloneSourceEtag) === texto(item.etag)
    );
    return { ok: coincide, clave: item.key, bytes: item.size };
  });
  const fallos = resultados.filter((item) => !item?.ok);
  return {
    ok: fallos.length === 0,
    procesados: resultados.length,
    coinciden: resultados.filter((item) => item?.ok).length,
    bytes: resultados.filter((item) => item?.ok).reduce((total, item) => total + Number(item.bytes || 0), 0),
    fallos: fallos.slice(0, 5),
    cursor: listado.truncated ? listado.cursor : '',
    truncated: listado.truncated === true
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });

  const host = new URL(request.url).hostname.toLowerCase();
  if (host !== PREVIEW_HOST) {
    return json(403, { ok: false, erro: 'Esta ferramenta só pode executarse no dominio Preview.' });
  }

  if (
    !env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN ||
    !env.R2_PUBLICO || !env.R2_PRIVADO ||
    !env.R2_PUBLICO_PREVIEW || !env.R2_PRIVADO_PREVIEW
  ) {
    return json(500, { ok: false, erro: 'Faltan bindings R2 ou variables necesarias para a migración.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const usuario = await verificarToken(datos.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'Identificación non válida ou caducada' });

  try {
    await comprobarAdministracion(env, usuario);
    const tipo = texto(datos.tipo).toLowerCase();
    const { orixe, destino } = buckets(env, tipo);
    const accion = texto(datos.accion).toLowerCase();

    if (accion === 'comprobar') {
      const resultado = await comprobarIllamento(orixe, destino, tipo);
      return json(resultado.illado ? 200 : 409, { ok: resultado.illado, tipo, ...resultado });
    }

    if (accion === 'copiar') {
      const resultado = await copiarLote(orixe, destino, tipo, texto(datos.cursor));
      return json(resultado.ok ? 200 : 503, { tipo, accion, ...resultado });
    }

    if (accion === 'verificar') {
      const resultado = await verificarLote(orixe, destino, texto(datos.cursor));
      return json(resultado.ok ? 200 : 409, { tipo, accion, ...resultado });
    }

    return json(400, { ok: false, erro: 'Acción non permitida' });
  } catch (error) {
    console.error('Erro na migración R2 de Preview:', error);
    return json(503, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non se puido completar a operación'
    });
  }
}
