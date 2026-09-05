import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';
import { obterPermisoPortal } from '../_lib/portal-permissions.js';

const TOKEN_PREFIX = 'persoas/revisions/';
const TIMEOUT_FIREBASE_MS = 8000;
const DIAS_AUDITORIA = 2;
const MARXE_R2_MS = 24 * 60 * 60 * 1000;
const R2_READ_BATCH = 25;
const APPS_SCRIPT_BATCH = 50;
const clean = (value) => String(value ?? '').trim();

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

async function verificarAdministrador(env, data) {
  const user = await verificarFirebase(data?.idToken, env.FIREBASE_API_KEY);
  if (!user) throw Object.assign(new Error('A sesión administrativa non é válida.'), { status: 401 });
  const permiso = await obterPermisoPortal(env, user, 'persoas');
  if (!permiso?.podeAdministrar) {
    throw Object.assign(new Error('Non tes permiso de Administración no módulo Persoas.'), { status: 403 });
  }
  return user;
}

function primeiroCorreoValido(value) {
  const candidatos = String(value || '').split(/[;,\s]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
  return candidatos.find(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || '';
}

async function lerInvitacion(env, obxecto, emailAdmin, limiteCreacion) {
  const object = await env.R2_PRIVADO.get(obxecto.key);
  if (!object) return null;
  const invitation = await object.json().catch(() => null);
  if (!invitation) return null;
  if (clean(invitation.xeracion) !== 'MASIVA') return null;
  if (clean(invitation.administrador).toLowerCase() !== clean(emailAdmin).toLowerCase()) return null;
  const creadaEn = clean(invitation.creadaEn);
  const revisionId = clean(invitation.revisionId);
  if (!creadaEn || !revisionId || Date.parse(creadaEn) < limiteCreacion) return null;
  return {
    revisionId,
    creadaEn,
    idPersoa: clean(invitation.idPersoa),
    nome: clean(invitation?.persoa?.nomeCompleto) || clean(invitation.idPersoa),
    correo: primeiroCorreoValido(invitation?.persoa?.correo),
    estadoRevision: clean(invitation.estado),
    caducaEn: clean(invitation.caducaEn)
  };
}

async function listarInvitacionsMasivasRecentes(env, emailAdmin, limiteCreacion) {
  const invitacions = [];
  const limiteObxecto = limiteCreacion - MARXE_R2_MS;
  let cursor;
  do {
    const listado = await env.R2_PRIVADO.list({ prefix: TOKEN_PREFIX, limit: 1000, cursor });
    const candidatos = (listado.objects || []).filter(obxecto => {
      const uploaded = obxecto?.uploaded instanceof Date ? obxecto.uploaded.getTime() : Date.parse(obxecto?.uploaded || '');
      return !Number.isFinite(uploaded) || uploaded >= limiteObxecto;
    });

    for (let i = 0; i < candidatos.length; i += R2_READ_BATCH) {
      const lote = candidatos.slice(i, i + R2_READ_BATCH);
      const resultados = await Promise.all(lote.map(obxecto => lerInvitacion(env, obxecto, emailAdmin, limiteCreacion)));
      for (const item of resultados) if (item) invitacions.push(item);
    }
    cursor = listado.truncated ? listado.cursor : undefined;
  } while (cursor);
  return invitacions;
}

async function consultarLoteMarcas(env, user, lote) {
  const { resultado } = await obterJsonAppsScriptPersoas(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'estadoEnviosRevisionsPersoasAdministracion',
    email: user.email,
    actorEmail: user.email,
    uidFirebase: user.uid,
    autorizadoR2: true,
    revisionIds: lote
  }, { timeoutMs: 20_000, attemptTimeoutMs: 20_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Non foi posible consultar o estado dos envíos.');
  return Array.isArray(resultado.enviados) ? resultado.enviados : [];
}

async function consultarMarcas(env, user, revisionIds) {
  const lotes = [];
  for (let i = 0; i < revisionIds.length; i += APPS_SCRIPT_BATCH) {
    lotes.push(revisionIds.slice(i, i + APPS_SCRIPT_BATCH));
  }
  const resultados = await Promise.all(lotes.map(lote => consultarLoteMarcas(env, user, lote)));
  return resultados.flat();
}

function agruparTandas(invitacions, marcas) {
  const mapaMarcas = new Map(marcas.map(item => [clean(item.revisionId), item]));
  const grupos = new Map();
  for (const item of invitacions) {
    if (!grupos.has(item.creadaEn)) grupos.set(item.creadaEn, []);
    const marca = mapaMarcas.get(item.revisionId);
    grupos.get(item.creadaEn).push({
      ...item,
      enviado: Boolean(marca),
      enviadoEn: clean(marca?.enviadoEn),
      correoEnvio: clean(marca?.correo)
    });
  }
  return [...grupos.entries()]
    .map(([creadaEn, elementos]) => {
      elementos.sort((a, b) => a.nome.localeCompare(b.nome, 'gl', { sensitivity: 'base' }));
      const enviados = elementos.filter(x => x.enviado);
      const nonEnviados = elementos.filter(x => !x.enviado);
      return {
        creadaEn,
        total: elementos.length,
        enviados: enviados.length,
        nonEnviados: nonEnviados.length,
        elementos,
        pendentesEnvio: nonEnviados
      };
    })
    .sort((a, b) => Date.parse(b.creadaEn) - Date.parse(a.creadaEn));
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  const { request, env } = context;
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'Falta configuración do servizo.' });
  }
  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  let user;
  try { user = await verificarAdministrador(env, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error.message }); }

  try {
    const limite = Date.now() - DIAS_AUDITORIA * 24 * 60 * 60 * 1000;
    const recentes = await listarInvitacionsMasivasRecentes(env, user.email, limite);
    const revisionIds = recentes.map(x => x.revisionId);
    const marcas = revisionIds.length ? await consultarMarcas(env, user, revisionIds) : [];
    return json(200, {
      ok: true,
      xeradoEn: new Date().toISOString(),
      tandas: agruparTandas(recentes, marcas)
    });
  } catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible auditar os envíos.' });
  }
}
