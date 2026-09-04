import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';
import { obterPermisoPortal } from '../_lib/portal-permissions.js';

const TOKEN_PREFIX = 'persoas/revisions/';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FIREBASE_TIMEOUT_MS = 8_000;
const SHEET_FALLBACK_TIMEOUT_MS = 15_000;
const SNAPSHOT_KEY_MAIN = 'persoas/cache/snapshot-v4.json';
const SNAPSHOT_KEY_PREVIEW = 'persoas/cache/preview/snapshot-v4.json';
const LEGAL_DATOS_ID = 'DATOS_PERSOA_SCPP';
const LEGAL_COTA_ID = 'EXENCION_COTA_SCPP';

const clean = (value) => String(value == null ? '' : value).trim();
const branch = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const snapshotKey = (env) => branch(env) === 'main' ? SNAPSHOT_KEY_MAIN : SNAPSHOT_KEY_PREVIEW;
const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  }
});

async function fetchTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetchTimeout(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    FIREBASE_TIMEOUT_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}

function crearToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function personKey(item) {
  return clean(item?.idPersoa || item?.id || item?.rowId);
}

function snapshotPublico(item) {
  return {
    idPersoa: personKey(item),
    nomeCompleto: clean(item?.nomeCompleto),
    nome: clean(item?.nome),
    primeiroApelido: clean(item?.primeiroApelido),
    segundoApelido: clean(item?.segundoApelido),
    nif: clean(item?.nif),
    dataNacemento: clean(item?.dataNacemento),
    telefono: clean(item?.telefono),
    correo: clean(item?.correo),
    enderezo: clean(item?.enderezo),
    cidade: clean(item?.cidade),
    cp: clean(item?.cp),
    contactoEmerxencia: clean(item?.contactoEmerxencia),
    telefonoEmerxencia: clean(item?.telefonoEmerxencia),
    preferenciaComunicacion: clean(item?.preferenciaComunicacion),
    consentimentoFoto: clean(item?.consentimentoFoto),
    mostrarAniversario: item?.mostrarAniversario === true,
    voz: clean(item?.voz),
    tipoSocio: clean(item?.tipoSocio),
    cargo: clean(item?.cargo),
    dataIncorporacion: clean(item?.dataIncorporacion)
  };
}

function validarTextoLegal(value, expectedId) {
  const item = value && typeof value === 'object' ? value : null;
  if (!item) return null;
  const legal = {
    id: clean(item.id),
    version: clean(item.version),
    titulo: clean(item.titulo),
    texto: clean(item.texto),
    ambito: clean(item.ambito),
    dataVixencia: clean(item.dataVixencia)
  };
  if (legal.id !== expectedId || !legal.version || !legal.titulo || !legal.texto) return null;
  return legal;
}

async function lerSnapshotR2(env) {
  if (!env.R2_PRIVADO?.get) return null;
  try {
    const object = await env.R2_PRIVADO.get(snapshotKey(env));
    if (!object) return null;
    const entry = await object.json().catch(() => null);
    const payload = entry?.payload;
    if (!payload?.ok || !Array.isArray(payload.persoas)) return null;
    if (!validarTextoLegal(payload?.textosLegais?.datosPersoa, LEGAL_DATOS_ID)) return null;
    if (!validarTextoLegal(payload?.textosLegais?.exencionCota, LEGAL_COTA_ID)) return null;
    return payload;
  } catch (error) {
    console.warn('Non se puido ler o snapshot de Persoas para xerar a revisión:', error);
    return null;
  }
}

async function listarDesdeSheet(env, user) {
  const { resultado } = await obterJsonAppsScriptPersoas(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'persoasV2Listar',
    email: user.email,
    actorEmail: user.email,
    uidFirebase: user.uid
  }, {
    timeoutMs: SHEET_FALLBACK_TIMEOUT_MS,
    attemptTimeoutMs: 8_000
  });
  return resultado;
}

async function obterListado(env, user) {
  const r2 = await lerSnapshotR2(env);
  if (r2) return { listado: r2, fonte: 'R2-SNAPSHOT' };
  const sheet = await listarDesdeSheet(env, user);
  return { listado: sheet, fonte: 'SHEET-FALLBACK' };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO?.get || !env.R2_PRIVADO?.put) {
    return json(500, { ok: false, erro: 'O servizo de revisión de Persoas non está configurado.' });
  }

  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }
  if (clean(data?.accion) !== 'xerarLigazon') return json(400, { ok: false, erro: 'Acción non permitida.' });

  const user = await verificarFirebase(data?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión administrativa non é válida.' });

  const permiso = await obterPermisoPortal(env, user, 'persoas').catch(() => null);
  if (!permiso?.podeEscribir) return json(403, { ok: false, erro: 'Non tes permiso de escritura no módulo Persoas.' });

  let result;
  try {
    result = await obterListado(env, user);
  } catch (error) {
    return json(503, {
      ok: false,
      erro: error instanceof Error ? error.message : 'Non foi posible preparar os datos da revisión.'
    });
  }
  const { listado, fonte } = result;

  if (!listado?.ok || !Array.isArray(listado.persoas)) {
    return json(503, { ok: false, erro: listado?.erro || 'Non hai un snapshot válido de Persoas dispoñible.' });
  }

  const ref = clean(data?.idPersoa || data?.id || data?.rowId);
  const persoa = listado.persoas.find((item) =>
    [item?.idPersoa, item?.id, item?.rowId].some((value) => clean(value) === ref)
  );
  if (!persoa) return json(404, { ok: false, erro: 'Non se atopou a persoa.' });
  if (persoa?.activo !== true) return json(400, { ok: false, erro: 'Non se xera revisión para unha persoa en baixa.' });

  const textoLegal = validarTextoLegal(listado?.textosLegais?.datosPersoa, LEGAL_DATOS_ID);
  const textoCota = validarTextoLegal(listado?.textosLegais?.exencionCota, LEGAL_COTA_ID);
  if (!textoLegal) return json(503, { ok: false, erro: 'O texto de protección de datos de Persoas non está dispoñible.' });
  if (!textoCota) return json(503, { ok: false, erro: 'A información sobre o pagamento da cota non está dispoñible.' });

  const token = crearToken();
  const now = Date.now();
  const revision = {
    version: 3,
    revisionId: crypto.randomUUID(),
    token,
    estado: 'PENDENTE',
    idPersoa: personKey(persoa),
    administrador: user.email,
    creadaEn: new Date(now).toISOString(),
    caducaEn: new Date(now + TOKEN_TTL_MS).toISOString(),
    persoa: snapshotPublico(persoa),
    textoLegal,
    textoCota
  };

  await env.R2_PRIVADO.put(`${TOKEN_PREFIX}${token}.json`, JSON.stringify(revision), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });

  const url = new URL(request.url);
  const ligazon = `${url.origin}/revision-datos/?token=${encodeURIComponent(token)}`;
  return json(200, {
    ok: true,
    ligazon,
    caducaEn: revision.caducaEn,
    persoa: revision.persoa.nomeCompleto || revision.idPersoa,
    correo: revision.persoa.correo,
    textoLegal: { id: textoLegal.id, version: textoLegal.version, titulo: textoLegal.titulo },
    textoCota: { id: textoCota.id, version: textoCota.version, titulo: textoCota.titulo },
    envioAutomatico: false,
    fonte
  }, {
    'X-SCPP-Review-Source': fonte
  });
}
