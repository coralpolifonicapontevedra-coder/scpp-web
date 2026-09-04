import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';
import { obterPermisoPortal } from '../_lib/portal-permissions.js';

const TOKEN_PREFIX = 'persoas/revisions/';
const ACCEPTANCE_PREFIX = 'persoas/aceptacions/';
const SNAPSHOT_MAIN = 'persoas/cache/snapshot-v4.json';
const SNAPSHOT_PREVIEW = 'persoas/cache/preview/snapshot-v4.json';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8000;
const LEGAL_ID = 'DATOS_PERSOA_SCPP';
const LEGAL_COTA_ID = 'EXENCION_COTA_SCPP';

const clean = (value) => String(value ?? '').trim();
const rama = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const snapshotKey = (env) => rama(env) === 'main' ? SNAPSHOT_MAIN : SNAPSHOT_PREVIEW;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
});

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: clean(user.localId), email: clean(user.email).toLowerCase() };
}

async function verificarAdministrador(context, data) {
  const user = await verificarFirebase(data.idToken, context.env.FIREBASE_API_KEY);
  if (!user) throw Object.assign(new Error('A sesión administrativa non é válida.'), { status: 401 });
  const permiso = await obterPermisoPortal(context.env, user, 'persoas');
  if (!permiso?.podeAdministrar) {
    throw Object.assign(new Error('Non tes permiso de Administración no módulo Persoas.'), { status: 403 });
  }
  return { user, permiso };
}

async function lerSnapshot(env) {
  const object = await env.R2_PRIVADO?.get?.(snapshotKey(env));
  if (!object) return null;
  const entry = await object.json().catch(() => null);
  if (!entry?.payload?.ok || !Array.isArray(entry.payload.persoas)) return null;
  return entry;
}

async function chamarListadoAppsScript(env, user) {
  if (!env.WEB_WRITE_TOKEN) throw new Error('Apps Script non está configurado.');
  const { resultado } = await obterJsonAppsScriptPersoas(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'persoasV2Listar',
    email: user.email,
    actorEmail: user.email,
    uidFirebase: user.uid
  }, { timeoutMs: 20_000, attemptTimeoutMs: 10_000 });
  if (!resultado?.ok || !Array.isArray(resultado.persoas)) {
    throw new Error(resultado?.erro || 'Non foi posible reconstruír Persoas desde a Sheet.');
  }
  return resultado;
}

function personKey(item) { return clean(item?.idPersoa || item?.id || item?.rowId); }
function safeId(value) { return clean(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120); }
function keyToken(token) { return `${TOKEN_PREFIX}${token}.json`; }
function keyAcceptanceIndex(idPersoa) { return `${ACCEPTANCE_PREFIX}${safeId(idPersoa)}/latest.json`; }

function textoLegalValido(value, expectedId = LEGAL_ID) {
  const legal = value && typeof value === 'object' ? value : null;
  if (!legal) return null;
  const id = clean(legal.id);
  const version = clean(legal.version);
  const titulo = clean(legal.titulo);
  const texto = clean(legal.texto);
  const ambito = clean(legal.ambito);
  const dataVixencia = clean(legal.dataVixencia);
  if (id !== expectedId || !version || !titulo || !texto) return null;
  return { id, version, titulo, texto, ambito, dataVixencia };
}

function textosCompletos(listado) {
  const base = textoLegalValido(listado?.textosLegais?.datosPersoa, LEGAL_ID);
  const cota = textoLegalValido(listado?.textosLegais?.exencionCota, LEGAL_COTA_ID);
  return { base, cota, ok: Boolean(base && cota) };
}

function combinarTextos(textoLegal, textoCota) {
  return {
    ...textoLegal,
    titulo: textoLegal.titulo || 'Protección de datos',
    texto: [
      textoLegal.texto,
      'INFORMACIÓN SOBRE O PAGAMENTO DA COTA SOCIAL',
      textoCota.titulo && textoCota.titulo !== textoLegal.titulo ? textoCota.titulo : '',
      textoCota.texto,
      'Esta información sobre a cota social é de carácter informativo e non require unha aceptación independente.'
    ].filter(Boolean).join('\n\n')
  };
}

function preservarFotos(persoasNovas, persoasAnteriores) {
  const fotos = new Map((persoasAnteriores || []).map((item) => [personKey(item), item?.fotoR2 || null]));
  return (persoasNovas || []).map((item) => {
    const foto = fotos.get(personKey(item));
    return foto ? { ...item, fotoR2: foto } : item;
  });
}

async function gardarFallbackEnR2(env, anterior, listado) {
  if (!env.R2_PRIVADO?.put || !listado?.ok || !Array.isArray(listado.persoas)) return;
  const persoas = preservarFotos(listado.persoas, anterior?.payload?.persoas);
  const payload = {
    ...(anterior?.payload || {}),
    ok: true,
    sourceVersion: clean(listado.version),
    perfil: listado.perfil || anterior?.payload?.perfil || null,
    schema: listado.schema || anterior?.payload?.schema || { fields: [] },
    textosLegais: listado.textosLegais || {},
    persoas
  };
  await env.R2_PRIVADO.put(snapshotKey(env), JSON.stringify({
    version: 'persoas-v4',
    savedAt: Date.now(),
    sourceVersion: clean(listado.version),
    payload
  }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
}

async function obterListado(context, user) {
  const snapshot = await lerSnapshot(context.env);
  if (snapshot?.payload?.persoas && textosCompletos(snapshot.payload).ok) {
    return { listado: snapshot.payload, fonte: 'R2' };
  }
  const listado = await chamarListadoAppsScript(context.env, user);
  await gardarFallbackEnR2(context.env, snapshot, listado).catch((error) => {
    console.warn('A revisión masiva recuperouse da Sheet pero non puido renovar R2:', error);
  });
  return { listado, fonte: 'SHEET-RECOVERY' };
}

function crearToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

function primeiroCorreoValido(value) {
  const candidatos = String(value || '').split(/[;,\s]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
  return candidatos.find(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || '';
}

function eCantor(item) {
  const tipo = clean(item?.tipoSocio).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  return tipo === 'cantor/a' || tipo === 'cantor' || tipo === 'cantora';
}

async function tenAceptacionVixente(env, idPersoa, versionLegal) {
  try {
    const object = await env.R2_PRIVADO?.get?.(keyAcceptanceIndex(idPersoa));
    if (!object) return false;
    const meta = await object.json();
    return clean(meta?.versionLegal) === clean(versionLegal);
  } catch { return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'Falta configuración do servizo.' });
  }

  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  let authData;
  try { authData = await verificarAdministrador(context, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error.message }); }

  let source;
  try { source = await obterListado(context, authData.user); }
  catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible obter Persoas.' });
  }

  const legais = textosCompletos(source.listado);
  if (!legais.base) return json(503, { ok: false, erro: 'O texto de protección de datos de Persoas non está dispoñible en TextosLegais.' });
  if (!legais.cota) return json(503, { ok: false, erro: 'A información sobre o pagamento da cota non está dispoñible en TextosLegais.' });
  const textoLegal = combinarTextos(legais.base, legais.cota);

  const alcance = clean(data.alcance || 'cantores');
  const rexenerar = data.rexenerar === true;
  const todas = Array.isArray(source.listado?.persoas) ? source.listado.persoas : [];
  const candidatas = todas.filter(p => p?.activo === true && (alcance === 'todas' || eCantor(p)));
  const url = new URL(request.url);
  const resultados = [];
  const omitidas = [];
  const now = Date.now();

  for (const persoa of candidatas) {
    const idPersoa = personKey(persoa);
    const nome = clean(persoa?.nomeCompleto) || idPersoa;
    const correo = primeiroCorreoValido(persoa?.correo);
    if (!idPersoa) { omitidas.push({ nome, motivo: 'Sen identificador interno' }); continue; }
    if (!correo) { omitidas.push({ idPersoa, nome, motivo: 'Sen correo electrónico válido' }); continue; }
    if (!rexenerar && await tenAceptacionVixente(env, idPersoa, legais.base.version)) {
      omitidas.push({ idPersoa, nome, correo, motivo: `Xa ten aceptada a versión ${legais.base.version}` });
      continue;
    }

    const token = crearToken();
    const invitation = {
      version: 4,
      revisionId: crypto.randomUUID(),
      token,
      estado: 'PENDENTE',
      idPersoa,
      administrador: authData.user.email,
      creadaEn: new Date(now).toISOString(),
      caducaEn: new Date(now + TOKEN_TTL_MS).toISOString(),
      persoa: snapshotPublico(persoa),
      textoLegal,
      textoLegalDatos: legais.base,
      textoCota: legais.cota,
      xeracion: 'MASIVA'
    };

    try {
      await env.R2_PRIVADO.put(keyToken(token), JSON.stringify(invitation), {
        httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
      });
      resultados.push({
        idPersoa,
        nome,
        correo,
        ligazon: `${url.origin}/revision-datos/?token=${encodeURIComponent(token)}`,
        caducaEn: invitation.caducaEn
      });
    } catch (error) {
      omitidas.push({ idPersoa, nome, correo, motivo: error instanceof Error ? error.message : 'Erro ao xerar a ligazón' });
    }
  }

  return json(200, {
    ok: true,
    fonte: source.fonte,
    alcance,
    versionLegal: legais.base.version,
    tituloLegal: legais.base.titulo,
    versionCota: legais.cota.version,
    tituloCota: legais.cota.titulo,
    candidatas: candidatas.length,
    xeradas: resultados.length,
    omitidas: omitidas.length,
    resultados,
    detalleOmitidas: omitidas,
    envioAutomatico: false
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  return onRequestPost(context);
}
