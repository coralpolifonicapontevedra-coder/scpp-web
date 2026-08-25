import { AppsScriptError, obterJsonAppsScript } from './apps-script.js';

const PREVIEW_HOST = 'preview.coralpolifonicapontevedra.org';
const INDEX_PUBLICO = 'indices/galeria-publica-v1.json';
const INDEX_PRIVADO = 'indices/galeria-privada.json';
const INDEX_REVISION = 'indices/revision-fotos-v1.json';
const CATALOGO = 'indices/catalogo-fotos.json';
const CACHE_REVISION = 'cache/fotos/listar-revision.json';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-SCPP-Delete-Version': 'FOTOS-ADMIN-DELETE-V3',
    'X-Content-Type-Options': 'nosniff'
  }
});

const texto = (valor) => String(valor ?? '').trim();
const idFoto = (foto) => texto(
  foto?.idFoto || foto?.Id_Foto || foto?.id || foto?.Id || foto?.ID || foto?.rowId || foto?.['Row ID']
);

async function verificarToken(idToken, apiKey) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: texto(idToken) })
    }
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  return user?.email && user.emailVerified === true
    ? { uid: texto(user.localId), email: texto(user.email).toLowerCase() }
    : null;
}

async function comprobarAdministracion(env, usuario) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'comprobarFotosAdministracionPortal',
    email: usuario.email,
    uidFirebase: usuario.uid
  }, { timeoutMs: 35_000, attemptTimeoutMs: 12_000 });

  if (!resultado?.ok || resultado?.administrador !== true) {
    throw new Error(resultado?.erro || 'Administración non autorizada');
  }
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

function preparar(indice, fotos, operacionId) {
  const agora = new Date();
  return {
    ...indice,
    ok: true,
    fotos,
    total: fotos.length,
    xeradoEn: agora.toISOString(),
    xeradoEnMs: agora.getTime(),
    actualizadoDesde: `FOTOS-DELETE-V3-${operacionId}`,
    version: '9'
  };
}

function rutasFoto(foto) {
  return new Set([
    foto?.rutaR2Publica,
    foto?.rutaR2_Publica,
    foto?.RutaR2_Publica,
    foto?.rutaR2Privada,
    foto?.rutaR2_Privada,
    foto?.RutaR2_Privada,
    foto?.rutaR2Traballo,
    foto?.rutaR2,
    foto?.RutaR2,
    foto?.rutaMiniaturaPublica,
    foto?.rutaMiniatura_Publica,
    foto?.RutaMiniaturaPublica,
    foto?.rutaMiniaturaPrivada,
    foto?.rutaMiniaturaRevision,
    foto?.rutaMiniatura_Privada,
    foto?.rutaMiniatura
  ].map(texto).filter(Boolean));
}

function fotoMarcadaPreview(head) {
  if (!head) return false;
  const meta = head.customMetadata || {};
  return texto(meta.previewClone).toLowerCase() === 'true' ||
    Boolean(texto(meta.previewCloneSourceEtag)) ||
    texto(meta.backend).toLowerCase() === 'fotos-administracion-v2';
}

async function existePrefix(bucket, prefix) {
  const page = await bucket.list({ prefix, limit: 1 });
  return Array.isArray(page.objects) && page.objects.length > 0;
}

async function residuosCoId(env, id) {
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

  const atopados = [];
  for (const clave of directosPrivados) {
    if (await env.R2_PRIVADO.head(clave).catch(() => null)) atopados.push(`privado:${clave}`);
  }
  for (const prefix of prefixos) {
    if (await existePrefix(env.R2_PRIVADO, prefix).catch(() => false)) atopados.push(`privado:${prefix}*`);
    if (await existePrefix(env.R2_PUBLICO, prefix).catch(() => false)) atopados.push(`publico:${prefix}*`);
  }
  return atopados;
}

async function comprobarR2Preview(env, fotosObxectivo, id) {
  const rutas = [...new Set(fotosObxectivo.flatMap((foto) => [...rutasFoto(foto)]))];
  if (!rutas.length) {
    const residuos = await residuosCoId(env, id);
    if (residuos.length) {
      const erro = new Error('Borrado bloqueado: hai ficheiros R2 asociados ao identificador pero os índices non gardan as súas rutas.');
      erro.codigo = 'ORPHAN_HAS_R2_RESIDUES';
      throw erro;
    }
    return { huerfana: true, rutas: new Set() };
  }

  for (const clave of rutas) {
    const [privado, publico] = await Promise.all([
      env.R2_PRIVADO.head(clave).catch(() => null),
      env.R2_PUBLICO.head(clave).catch(() => null)
    ]);
    if (fotoMarcadaPreview(privado) || fotoMarcadaPreview(publico)) {
      return { huerfana: false, rutas: new Set(rutas) };
    }
  }

  const erro = new Error('Borrado bloqueado: non se confirmou que os obxectos pertenzan aos buckets clonados de Preview.');
  erro.codigo = 'R2_PREVIEW_NOT_VERIFIED';
  throw erro;
}

async function eliminarPorPrefix(bucket, prefix) {
  let cursor;
  let total = 0;
  do {
    const page = await bucket.list({ prefix, cursor });
    const keys = (page.objects || []).map((item) => item.key).filter(Boolean);
    if (keys.length) {
      await bucket.delete(keys);
      total += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

async function eliminarAssetsNonCompartidos(bucket, rutas, rutasRestantes) {
  const eliminables = [...rutas].filter((clave) => !rutasRestantes.has(clave));
  if (!eliminables.length) return 0;
  const existentes = [];
  for (const clave of eliminables) {
    if (await bucket.head(clave).catch(() => null)) existentes.push(clave);
  }
  if (existentes.length) await bucket.delete(existentes);
  return existentes.length;
}

async function chamarBorradoSheet(env, usuario, id, huerfana) {
  const accion = huerfana
    ? 'eliminarFotoHuerfanaAdministracionPortal'
    : 'eliminarFotoAdministracionPortal';
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto: id
  }, { timeoutMs: 60_000, attemptTimeoutMs: 25_000 });

  if (!resultado?.ok) {
    const erro = new Error(resultado?.erro || 'Non se puido eliminar a fotografía na Sheet de Preview.');
    erro.codigo = resultado?.codigo || '';
    throw erro;
  }
  if (resultado.entorno !== 'preview') throw new Error('Apps Script non confirmou o entorno Preview.');
  if (huerfana && resultado.huerfana !== true) {
    throw new Error('Apps Script non confirmou que o rexistro fose huérfano.');
  }
  return resultado;
}

async function rollbackIndices(env, backup) {
  await Promise.allSettled([
    gardar(env.R2_PUBLICO, INDEX_PUBLICO, backup.pub, true),
    gardar(env.R2_PRIVADO, INDEX_PRIVADO, backup.pri, false),
    gardar(env.R2_PRIVADO, INDEX_REVISION, backup.rev, false),
    gardar(env.R2_PRIVADO, CATALOGO, backup.cat, false)
  ]);
}

export async function onRequestFotosDeleteV3({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });

  const host = new URL(request.url).hostname.toLowerCase();
  if (host !== PREVIEW_HOST) {
    return json(403, { ok: false, erro: 'O borrado v3 está habilitado exclusivamente no dominio Preview.' });
  }

  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PUBLICO || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O borrado v3 de fotografías non está configurado.' });
  }

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  const id = texto(datos.idFoto || datos.rowId);
  if (!id) return json(400, { ok: false, erro: 'Falta identificar a fotografía.' });

  const usuario = await verificarToken(datos.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  let backup = null;
  let indicesActualizados = false;

  try {
    await comprobarAdministracion(env, usuario);

    const [pub0, pri0, rev0, cat0] = await Promise.all([
      ler(env.R2_PUBLICO, INDEX_PUBLICO),
      ler(env.R2_PRIVADO, INDEX_PRIVADO),
      ler(env.R2_PRIVADO, INDEX_REVISION),
      ler(env.R2_PRIVADO, CATALOGO)
    ]);
    backup = { pub: pub0, pri: pri0, rev: rev0, cat: cat0 };

    const todas = [...pub0.fotos, ...pri0.fotos, ...rev0.fotos, ...cat0.fotos];
    const obxectivo = todas.filter((foto) => idFoto(foto) === id);
    if (!obxectivo.length) return json(404, { ok: false, erro: 'Fotografía non localizada nos índices R2 de Preview.' });

    const comprobacion = await comprobarR2Preview(env, obxectivo, id);
    const huerfana = comprobacion.huerfana === true;

    const operacionId = crypto.randomUUID();
    const filtrar = (indice) => indice.fotos.filter((foto) => idFoto(foto) !== id);
    const pubNovo = preparar(pub0, filtrar(pub0), operacionId);
    const priNovo = preparar(pri0, filtrar(pri0), operacionId);
    const revNovo = preparar(rev0, filtrar(rev0), operacionId);
    const catNovo = preparar(cat0, filtrar(cat0), operacionId);

    await Promise.all([
      gardar(env.R2_PUBLICO, INDEX_PUBLICO, pubNovo, true),
      gardar(env.R2_PRIVADO, INDEX_PRIVADO, priNovo, false),
      gardar(env.R2_PRIVADO, INDEX_REVISION, revNovo, false),
      gardar(env.R2_PRIVADO, CATALOGO, catNovo, false)
    ]);
    indicesActualizados = true;

    const [pubCheck, priCheck, revCheck, catCheck] = await Promise.all([
      ler(env.R2_PUBLICO, INDEX_PUBLICO),
      ler(env.R2_PRIVADO, INDEX_PRIVADO),
      ler(env.R2_PRIVADO, INDEX_REVISION),
      ler(env.R2_PRIVADO, CATALOGO)
    ]);
    if ([pubCheck, priCheck, revCheck, catCheck].some((indice) => indice.fotos.some((foto) => idFoto(foto) === id))) {
      throw new Error('R2 non confirmou a retirada da fotografía de todos os índices.');
    }

    let sheet;
    try {
      sheet = await chamarBorradoSheet(env, usuario, id, huerfana);
    } catch (erroSheet) {
      await rollbackIndices(env, backup);
      indicesActualizados = false;
      throw erroSheet;
    }

    const limpeza = {
      publicos: 0,
      privados: 0,
      prefixos: 0,
      huerfana,
      aviso: ''
    };

    if (huerfana) {
      await env.R2_PRIVADO.delete(CACHE_REVISION).catch(() => {});
    } else {
      const rutasObxectivo = comprobacion.rutas;
      const restantes = [...pubNovo.fotos, ...priNovo.fotos, ...revNovo.fotos, ...catNovo.fotos];
      const rutasRestantes = new Set(restantes.flatMap((foto) => [...rutasFoto(foto)]));

      try {
        const [publicos, privados] = await Promise.all([
          eliminarAssetsNonCompartidos(env.R2_PUBLICO, rutasObxectivo, rutasRestantes),
          eliminarAssetsNonCompartidos(env.R2_PRIVADO, rutasObxectivo, rutasRestantes)
        ]);
        limpeza.publicos = publicos;
        limpeza.privados = privados;

        const prefixos = [
          `fotos/editadas/${id}-`,
          `fotos/editadas-miniaturas/${id}-`
        ];
        for (const prefix of prefixos) {
          limpeza.prefixos += await eliminarPorPrefix(env.R2_PUBLICO, prefix);
          limpeza.prefixos += await eliminarPorPrefix(env.R2_PRIVADO, prefix);
        }

        await Promise.allSettled([
          env.R2_PRIVADO.delete(`fotos/traballo/${id}.json`),
          env.R2_PRIVADO.delete(`fotos/estado-edicion/${id}.json`),
          env.R2_PRIVADO.delete(`fotos/traballo-miniaturas/${id}.webp`),
          env.R2_PRIVADO.delete(`fotos/borradores/${id}`),
          env.R2_PRIVADO.delete(CACHE_REVISION)
        ]);
      } catch (erroLimpeza) {
        console.error('Borrado confirmado, pero quedaron obxectos R2 orfos:', erroLimpeza);
        limpeza.aviso = 'A fotografía foi eliminada dos índices, Sheet e Drive de Preview, pero pode quedar algún ficheiro R2 orfo.';
      }
    }

    return json(200, {
      ok: true,
      backend: 'FOTOS-ADMIN-DELETE-V3',
      entorno: 'preview',
      modo: huerfana ? 'rexistro-huerfano' : 'fotografia-completa',
      idFoto: id,
      sheet,
      limpeza,
      mensaxe: limpeza.aviso || sheet.mensaxe || sheet.avisoDrive || (
        huerfana
          ? 'Rexistro fotográfico huérfano eliminado e verificado en Preview.'
          : 'Fotografía eliminada e verificada en Preview.'
      )
    });
  } catch (erro) {
    if (indicesActualizados && backup) await rollbackIndices(env, backup);
    console.error('Erro no borrado v3 de fotografía:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT'
      ? 504
      : texto(erro?.codigo) === 'FORBIDDEN'
        ? 403
        : 409;
    return json(status, {
      ok: false,
      backend: 'FOTOS-ADMIN-DELETE-V3',
      codigo: texto(erro?.codigo),
      erro: erro instanceof Error ? erro.message : 'Non foi posible eliminar a fotografía.'
    });
  }
}
