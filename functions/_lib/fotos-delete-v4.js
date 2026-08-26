import { onRequestFotosDeleteV3 } from './fotos-delete-v3.js';

const PRODUCTION_HOSTS = new Set([
  'scpp-web.pages.dev',
  'coralpolifonicapontevedra.org',
  'www.coralpolifonicapontevedra.org'
]);
const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const CATALOGO = 'indices/catalogo-fotos.json';

const texto = (valor) => String(valor ?? '').trim();
const idFoto = (foto) => texto(
  foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID']
);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-SCPP-Delete-Version': 'FOTOS-ADMIN-DELETE-V4-PRODUCTION',
    'X-Content-Type-Options': 'nosniff'
  }
});

function fotoMarcadaPreview(head) {
  if (!head) return false;
  const meta = head.customMetadata || {};
  return texto(meta.previewClone).toLowerCase() === 'true' ||
    Boolean(texto(meta.previewCloneSourceEtag)) ||
    texto(meta.entorno || meta.environment || meta.env).toLowerCase() === 'preview';
}

async function ler(bucket, clave) {
  const object = await bucket.get(clave);
  if (!object) return { ok: true, fotos: [], total: 0 };
  const datos = await object.json().catch(() => null);
  if (!datos || !Array.isArray(datos.fotos)) throw new Error(`Índice R2 non válido: ${clave}`);
  return datos;
}

async function gardar(bucket, clave, indice, publico = false) {
  await bucket.put(clave, JSON.stringify(indice), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: publico
        ? 'public, max-age=0, no-cache, must-revalidate'
        : 'private, max-age=0, no-cache, must-revalidate'
    }
  });
}

async function listarPrefix(bucket, prefix, tipo) {
  const resultados = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const item of page.objects || []) {
      const head = await bucket.head(item.key).catch(() => null);
      if (head) resultados.push({ tipo, clave: item.key, head });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return resultados;
}

async function localizarResiduos(env, id) {
  const atopados = [];
  const directosPrivados = [
    `fotos/traballo/${id}.json`,
    `fotos/estado-edicion/${id}.json`,
    `fotos/traballo-miniaturas/${id}.webp`,
    `fotos/borradores/${id}`
  ];
  const prefixos = [
    `fotos/editadas/${id}-`,
    `fotos/editadas-miniaturas/${id}-`
  ];

  for (const clave of directosPrivados) {
    const head = await env.R2_PRIVADO.head(clave).catch(() => null);
    if (head) atopados.push({ tipo: 'privado', clave, head });
  }

  for (const prefix of prefixos) {
    atopados.push(...await listarPrefix(env.R2_PRIVADO, prefix, 'privado'));
    atopados.push(...await listarPrefix(env.R2_PUBLICO, prefix, 'publico'));
  }

  const unicos = new Map();
  for (const item of atopados) unicos.set(`${item.tipo}:${item.clave}`, item);
  return [...unicos.values()];
}

function escollerAncoraxe(residuos, id) {
  const prioridades = [
    `fotos/editadas/${id}-`,
    `fotos/editadas-miniaturas/${id}-`,
    `fotos/traballo-miniaturas/${id}.webp`,
    `fotos/traballo/${id}.json`,
    `fotos/estado-edicion/${id}.json`,
    `fotos/borradores/${id}`
  ];
  for (const prefix of prioridades) {
    const atopado = residuos.find((item) => item.clave.startsWith(prefix));
    if (atopado) return atopado;
  }
  return residuos[0] || null;
}

async function inxectarRutaRecuperada(env, id, clave) {
  const indices = [
    { bucket: env.R2_PRIVADO, clave: CATALOGO, publico: false },
    { bucket: env.R2_PRIVADO, clave: INDEX_REVISION, publico: false },
    { bucket: env.R2_PRIVADO, clave: INDEX_PRIVADO, publico: false },
    { bucket: env.R2_PUBLICO, clave: INDEX_PUBLICO, publico: true }
  ];

  for (const definicion of indices) {
    const actual = await ler(definicion.bucket, definicion.clave);
    if (!actual.fotos.some((foto) => idFoto(foto) === id)) continue;

    const modificado = {
      ...actual,
      fotos: actual.fotos.map((foto) => idFoto(foto) === id
        ? { ...foto, rutaR2Privada: clave, rutaRecuperadaDeleteV4: true }
        : foto)
    };
    await gardar(definicion.bucket, definicion.clave, modificado, definicion.publico);
    return { ...definicion, backup: actual };
  }

  throw new Error('Non se atopou o rexistro para ancorar temporalmente a ruta R2 recuperada.');
}

async function restaurarInxeccion(inxeccion) {
  if (!inxeccion) return;
  await gardar(inxeccion.bucket, inxeccion.clave, inxeccion.backup, inxeccion.publico);
}

export async function onRequestFotosDeleteV4(context) {
  const { request, env } = context;
  const requestPrimeiro = request.clone();
  const datos = await request.clone().json().catch(() => null);

  const primeira = await onRequestFotosDeleteV3({ ...context, request: requestPrimeiro });
  if (primeira.status !== 409) return primeira;

  const erroPrimeiro = await primeira.clone().json().catch(() => null);
  if (texto(erroPrimeiro?.codigo) !== 'ORPHAN_HAS_R2_RESIDUES') return primeira;

  if (!PRODUCTION_HOSTS.has(new URL(request.url).hostname.toLowerCase())) return primeira;
  if (!env.R2_PUBLICO || !env.R2_PRIVADO) return primeira;

  const id = texto(datos?.idFoto || datos?.rowId);
  if (!id) return primeira;

  let inxeccion = null;
  try {
    const residuos = await localizarResiduos(env, id);
    if (!residuos.length) {
      return json(409, {
        ok: false,
        backend: 'FOTOS-ADMIN-DELETE-V4-PRODUCTION',
        codigo: 'R2_RECOVERY_EMPTY',
        erro: 'O estado R2 cambiou durante a comprobación. Non se realizou ningún borrado.'
      });
    }

    const dePreview = residuos.filter((item) => fotoMarcadaPreview(item.head));
    if (dePreview.length) {
      return json(409, {
        ok: false,
        backend: 'FOTOS-ADMIN-DELETE-V4-PRODUCTION',
        codigo: 'R2_RECOVERY_PREVIEW_OBJECT',
        erro: 'Borrado bloqueado: detectáronse obxectos asociados marcados como pertencentes a Preview.'
      });
    }

    const ancoraxe = escollerAncoraxe(residuos, id);
    if (!ancoraxe) return primeira;

    inxeccion = await inxectarRutaRecuperada(env, id, ancoraxe.clave);

    const segunda = await onRequestFotosDeleteV3({ ...context, request });
    if (!segunda.ok) {
      await restaurarInxeccion(inxeccion).catch((erro) => {
        console.error('Non se puido restaurar a ruta temporal de borrado v4:', erro);
      });
      return segunda;
    }

    const resultado = await segunda.clone().json().catch(() => null);
    return json(segunda.status, {
      ...(resultado || { ok: true }),
      backend: 'FOTOS-ADMIN-DELETE-V4-PRODUCTION',
      rutasRecuperadas: true,
      residuosVerificados: residuos.length
    });
  } catch (erro) {
    if (inxeccion) {
      await restaurarInxeccion(inxeccion).catch((erroRestore) => {
        console.error('Non se puido restaurar a ruta temporal tras erro no borrado v4:', erroRestore);
      });
    }
    console.error('Erro recuperando rutas R2 para o borrado v4 de Producción:', erro);
    return json(409, {
      ok: false,
      backend: 'FOTOS-ADMIN-DELETE-V4-PRODUCTION',
      codigo: 'R2_RECOVERY_FAILED',
      erro: erro instanceof Error ? erro.message : 'Non se puideron recuperar con seguridade as rutas R2.'
    });
  }
}
