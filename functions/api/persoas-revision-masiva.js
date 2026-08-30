const TOKEN_PREFIX = 'persoas/revisions/';
const ACCEPTANCE_PREFIX = 'persoas/aceptacions/';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8000;
const TIMEOUT_APPS_SCRIPT_MS = 15000;
const LEGAL_ID = 'DATOS_PERSOA_SCPP';

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
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: String(user.localId || ''), email: String(user.email).trim().toLowerCase() };
}

function urlAppsScriptPrincipal(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) ? url : '';
}

async function chamarAppsScript(env, body) {
  const url = urlAppsScriptPrincipal(env);
  if (!url || !env.WEB_WRITE_TOKEN) throw new Error('Apps Script non está configurado.');
  const response = await fetchConLimite(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: env.WEB_WRITE_TOKEN, ...body })
  }, TIMEOUT_APPS_SCRIPT_MS);
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('Apps Script devolveu unha resposta non válida.'); }
  if (!response.ok || !result?.ok) throw new Error(result?.erro || `Apps Script respondeu HTTP ${response.status}.`);
  return result;
}

function crearToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function personKey(item) { return String(item?.idPersoa || item?.id || item?.rowId || '').trim(); }
function safeId(value) { return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120); }
function keyToken(token) { return `${TOKEN_PREFIX}${token}.json`; }
function keyAcceptanceIndex(idPersoa) { return `${ACCEPTANCE_PREFIX}${safeId(idPersoa)}/latest.json`; }

function textoLegalValido(value) {
  const legal = value && typeof value === 'object' ? value : null;
  if (!legal) return null;
  const id = String(legal.id || '').trim();
  const version = String(legal.version || '').trim();
  const titulo = String(legal.titulo || '').trim();
  const texto = String(legal.texto || '').trim();
  const ambito = String(legal.ambito || '').trim();
  const dataVixencia = String(legal.dataVixencia || '').trim();
  if (id !== LEGAL_ID || !version || !titulo || !texto) return null;
  return { id, version, titulo, texto, ambito, dataVixencia };
}

function snapshotPublico(item) {
  return {
    idPersoa: personKey(item),
    nomeCompleto: String(item?.nomeCompleto || '').trim(),
    nome: String(item?.nome || '').trim(),
    primeiroApelido: String(item?.primeiroApelido || '').trim(),
    segundoApelido: String(item?.segundoApelido || '').trim(),
    nif: String(item?.nif || '').trim(),
    dataNacemento: String(item?.dataNacemento || '').trim(),
    telefono: String(item?.telefono || '').trim(),
    correo: String(item?.correo || '').trim(),
    enderezo: String(item?.enderezo || '').trim(),
    cidade: String(item?.cidade || '').trim(),
    cp: String(item?.cp || '').trim(),
    contactoEmerxencia: String(item?.contactoEmerxencia || '').trim(),
    telefonoEmerxencia: String(item?.telefonoEmerxencia || '').trim(),
    preferenciaComunicacion: String(item?.preferenciaComunicacion || '').trim(),
    consentimentoFoto: String(item?.consentimentoFoto || '').trim(),
    mostrarAniversario: item?.mostrarAniversario === true,
    voz: String(item?.voz || '').trim(),
    tipoSocio: String(item?.tipoSocio || '').trim(),
    cargo: String(item?.cargo || '').trim(),
    dataIncorporacion: String(item?.dataIncorporacion || '').trim()
  };
}

function primeiroCorreoValido(value) {
  const candidatos = String(value || '').split(/[;,\s]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
  return candidatos.find(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || '';
}

function eCantor(item) {
  const tipo = String(item?.tipoSocio || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return tipo === 'cantor/a' || tipo === 'cantor' || tipo === 'cantora';
}

async function tenAceptacionVixente(env, idPersoa, versionLegal) {
  try {
    const object = await env.R2_PRIVADO?.get?.(keyAcceptanceIndex(idPersoa));
    if (!object) return false;
    const meta = await object.json();
    return String(meta?.versionLegal || '').trim() === String(versionLegal || '').trim();
  } catch { return false; }
}

async function verificarAdministrador(context, data) {
  const user = await verificarFirebase(data.idToken, context.env.FIREBASE_API_KEY);
  if (!user) throw Object.assign(new Error('A sesión administrativa non é válida.'), { status: 401 });
  const listado = await chamarAppsScript(context.env, {
    accion: 'listarPersoasAdministracion',
    email: user.email,
    uidFirebase: user.uid,
    incluirTextoLegalPersoas: true
  });
  if (listado?.perfil?.nivel !== 'Administración') throw Object.assign(new Error('Non tes permiso de Administración.'), { status: 403 });
  return { user, listado };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok: false, erro: 'Falta configuración do servizo.' });
  let data;
  try { data = await request.json(); } catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  let authData;
  try { authData = await verificarAdministrador(context, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error.message }); }

  const textoLegal = textoLegalValido(authData.listado?.textoLegalPersoas);
  if (!textoLegal) return json(503, { ok: false, erro: 'O texto legal específico de Persoas non está dispoñible.' });

  const alcance = String(data.alcance || 'cantores');
  const rexenerar = data.rexenerar === true;
  const todas = Array.isArray(authData.listado?.persoas) ? authData.listado.persoas : [];
  const candidatas = todas.filter(p => p?.activo === true && (alcance === 'todas' || eCantor(p)));
  const url = new URL(request.url);
  const resultados = [];
  const omitidas = [];
  const now = Date.now();

  for (const persoa of candidatas) {
    const idPersoa = personKey(persoa);
    const nome = String(persoa?.nomeCompleto || '').trim() || idPersoa;
    const correo = primeiroCorreoValido(persoa?.correo);
    if (!idPersoa) { omitidas.push({ nome, motivo: 'Sen identificador interno' }); continue; }
    if (!correo) { omitidas.push({ idPersoa, nome, motivo: 'Sen correo electrónico válido' }); continue; }
    if (!rexenerar && await tenAceptacionVixente(env, idPersoa, textoLegal.version)) {
      omitidas.push({ idPersoa, nome, correo, motivo: `Xa ten aceptada a versión ${textoLegal.version}` });
      continue;
    }

    const token = crearToken();
    const invitation = {
      version: 2,
      revisionId: crypto.randomUUID(),
      token,
      estado: 'PENDENTE',
      idPersoa,
      administrador: authData.user.email,
      creadaEn: new Date(now).toISOString(),
      caducaEn: new Date(now + TOKEN_TTL_MS).toISOString(),
      persoa: snapshotPublico(persoa),
      textoLegal,
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
    alcance,
    versionLegal: textoLegal.version,
    tituloLegal: textoLegal.titulo,
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
