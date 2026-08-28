const TOKEN_PREFIX = 'persoas/revisions/';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8000;
const TIMEOUT_APPS_SCRIPT_MS = 15000;

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
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
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

function tokenValido(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : '';
}

function crearToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function keyToken(token) { return `${TOKEN_PREFIX}${token}.json`; }

function personKey(item) {
  return String(item?.idPersoa || item?.id || item?.rowId || '').trim();
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

function limparTexto(value, max = 240) { return String(value ?? '').trim().slice(0, max); }

function limparDatosPersoais(input) {
  const data = input && typeof input === 'object' ? input : {};
  const correo = limparTexto(data.correo, 160).toLowerCase();
  const cp = limparTexto(data.cp, 10);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('O correo electrónico non é válido.');
  if (cp && !/^\d{5}$/.test(cp)) throw new Error('O código postal debe ter cinco cifras.');
  return {
    nome: limparTexto(data.nome, 100),
    primeiroApelido: limparTexto(data.primeiroApelido, 120),
    segundoApelido: limparTexto(data.segundoApelido, 120),
    nif: limparTexto(data.nif, 30),
    dataNacemento: limparTexto(data.dataNacemento, 20),
    telefono: limparTexto(data.telefono, 40),
    correo,
    enderezo: limparTexto(data.enderezo, 240),
    cidade: limparTexto(data.cidade, 120),
    cp,
    contactoEmerxencia: limparTexto(data.contactoEmerxencia, 180),
    telefonoEmerxencia: limparTexto(data.telefonoEmerxencia, 40),
    preferenciaComunicacion: limparTexto(data.preferenciaComunicacion, 60),
    consentimentoFoto: limparTexto(data.consentimentoFoto, 80),
    mostrarAniversario: data.mostrarAniversario === true
  };
}

async function lerInvitacion(env, token) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(keyToken(token));
  if (!object) return null;
  const invitation = await object.json();
  if (!invitation || invitation.token !== token) return null;
  return invitation;
}

async function xerarLigazon(context, data) {
  const { env, request } = context;
  const user = await verificarFirebase(data.idToken, env.FIREBASE_API_KEY);
  if (!user) return json(401, { ok: false, erro: 'A sesión administrativa non é válida.' });
  const listado = await chamarAppsScript(env, { accion: 'listarPersoasAdministracion', email: user.email, uidFirebase: user.uid });
  if (listado?.perfil?.nivel !== 'Administración') return json(403, { ok: false, erro: 'Non tes permiso de Administración.' });

  const referencia = String(data.idPersoa || '').trim();
  const persoa = (Array.isArray(listado.persoas) ? listado.persoas : []).find((item) =>
    [item?.idPersoa, item?.id, item?.rowId].some((value) => String(value || '').trim() === referencia));
  if (!persoa) return json(404, { ok: false, erro: 'Non se atopou a persoa.' });
  if (persoa.activo !== true) return json(400, { ok: false, erro: 'Non se xera revisión para unha persoa en baixa.' });
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return json(503, { ok: false, erro: 'R2 privado non está dispoñible.' });

  const token = crearToken();
  const now = Date.now();
  const invitation = {
    version: 1,
    token,
    estado: 'PENDENTE',
    idPersoa: personKey(persoa),
    administrador: user.email,
    creadaEn: new Date(now).toISOString(),
    caducaEn: new Date(now + TOKEN_TTL_MS).toISOString(),
    persoa: snapshotPublico(persoa)
  };
  await env.R2_PRIVADO.put(keyToken(token), JSON.stringify(invitation), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });

  const url = new URL(request.url);
  const ligazon = `${url.origin}/revision-datos/?token=${encodeURIComponent(token)}`;
  return json(200, { ok: true, ligazon, caducaEn: invitation.caducaEn, persoa: invitation.persoa.nomeCompleto || invitation.idPersoa, envioAutomatico: false });
}

async function consultarLigazon(context, token) {
  const invitation = await lerInvitacion(context.env, token);
  if (!invitation) return json(404, { ok: false, erro: 'A ligazón non existe ou xa non está dispoñible.' });
  if (invitation.estado !== 'PENDENTE') return json(410, { ok: false, erro: 'Esta revisión xa foi completada.' });
  if (Date.parse(invitation.caducaEn) <= Date.now()) return json(410, { ok: false, erro: 'A ligazón de revisión caducou.' });
  return json(200, { ok: true, persoa: invitation.persoa, caducaEn: invitation.caducaEn });
}

async function gardarRevision(context, data, token) {
  const invitation = await lerInvitacion(context.env, token);
  if (!invitation) return json(404, { ok: false, erro: 'A ligazón non existe ou xa non está dispoñible.' });
  if (invitation.estado !== 'PENDENTE') return json(410, { ok: false, erro: 'Esta revisión xa foi completada.' });
  if (Date.parse(invitation.caducaEn) <= Date.now()) return json(410, { ok: false, erro: 'A ligazón de revisión caducou.' });

  let persoa;
  try { persoa = limparDatosPersoais(data.persoa); } catch (error) { return json(400, { ok: false, erro: error.message }); }
  if (!persoa.nome || !persoa.primeiroApelido) return json(400, { ok: false, erro: 'Nome e primeiro apelido son obrigatorios.' });

  const result = await chamarAppsScript(context.env, {
    accion: 'actualizarPersoaAdministracion',
    email: invitation.administrador,
    idPersoa: invitation.idPersoa,
    id: invitation.idPersoa,
    persoa
  });

  invitation.estado = 'COMPLETADA';
  invitation.completadaEn = new Date().toISOString();
  invitation.persoaConfirmada = persoa;
  await context.env.R2_PRIVADO.put(keyToken(token), JSON.stringify(invitation), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
  return json(200, { ok: true, mensaxe: result?.mensaxe || 'Os datos quedaron confirmados correctamente.' });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'Falta configuración do servizo.' });

  if (request.method === 'GET') {
    const token = tokenValido(new URL(request.url).searchParams.get('token'));
    if (!token) return json(400, { ok: false, erro: 'Falta unha ligazón de revisión válida.' });
    try { return await consultarLigazon(context, token); } catch (error) { return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible consultar a revisión.' }); }
  }

  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  let data;
  try { data = await request.json(); } catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  try {
    if (String(data.accion || '') === 'xerarLigazon') return await xerarLigazon(context, data);
    const token = tokenValido(data.token);
    if (!token) return json(400, { ok: false, erro: 'Falta unha ligazón de revisión válida.' });
    if (String(data.accion || '') === 'gardarRevision') return await gardarRevision(context, data, token);
    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible completar a operación.' });
  }
}
