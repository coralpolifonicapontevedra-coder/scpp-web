import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const PRIVATE_INDEX_KEY = 'indices/concertos-privado-v1.json';
const PUBLIC_INDEX_KEY = 'indices/concertos-v1.json';
const ESTADOS = new Set(['Previsto','Confirmado','Aprazado','Cancelado','Realizado']);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  }
});

function erro(status, etapa, codigo, mensaxe) {
  return json(status, { ok:false, etapa, codigo, erro:mensaxe });
}

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, redirect:'follow', signal:controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ idToken:token }) },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid:String(user.localId || ''), email:String(user.email).trim().toLowerCase() };
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email || '').trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function verificarAdministracionR2(env, user) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return false;
  const key = `${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`;
  const object = await env.R2_PRIVADO.get(key);
  if (!object) return false;
  const entry = await object.json().catch(() => null);
  return entry?.administrador === user.email && entry?.payload?.perfil?.nivel === 'Administración';
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token:env.WEB_WRITE_TOKEN,
    accion,
    email:user.email,
    uidFirebase:user.uid,
    ...datos
  }, { timeoutMs:TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs:8_000 });

  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

const texto = (value, max) => String(value || '').trim().slice(0, max);
const booleano = (value) => value === true;
const estadoIndice = (value) => String(value || '').trim().toLowerCase();

function payloadIndice(concertos, orixe = 'PORTAL_ADMIN_WRITE_THROUGH') {
  const agora = new Date();
  const historicos = concertos.filter((item) => item?.numeroConcerto);
  return {
    ok:true,
    version:1,
    xeradoEn:agora.toISOString(),
    xeradoEnMs:agora.getTime(),
    orixe,
    total:concertos.length,
    totalFonte:concertos.length,
    totalHistorico:historicos.length,
    ordeHistoricaMax:historicos.reduce((max, item) => Math.max(max, Number(item?.ordeHistorica) || 0), 0),
    concertos
  };
}

async function lerIndicePrivado(env) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(PRIVATE_INDEX_KEY);
  if (!object) return null;
  const data = await object.json().catch(() => null);
  if (!data?.ok || !Array.isArray(data.concertos)) return null;
  return data;
}

async function gardarIndices(env, concertos) {
  if (!env.R2_PRIVADO || !env.R2_PUBLICO || typeof env.R2_PRIVADO.put !== 'function' || typeof env.R2_PUBLICO.put !== 'function') {
    throw Object.assign(new Error('Os bindings R2 de concertos non están dispoñibles.'), { code:'R2_CONFIG' });
  }

  const ordenados = [...concertos].sort((a, b) =>
    String(a?.data || '9999-99-99').localeCompare(String(b?.data || '9999-99-99')) ||
    String(a?.id || '').localeCompare(String(b?.id || ''))
  );
  const privado = payloadIndice(ordenados);
  const publicos = ordenados.filter((item) => item?.mostrarWeb === true);
  const publico = {
    ...payloadIndice(publicos),
    totalFonte:ordenados.length,
    totalHistorico:privado.totalHistorico,
    ordeHistoricaMax:privado.ordeHistoricaMax
  };

  await Promise.all([
    env.R2_PRIVADO.put(PRIVATE_INDEX_KEY, JSON.stringify(privado), {
      httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, max-age=60' },
      customMetadata:{ 'scpp-source':'portal-admin-write-through', 'scpp-generated-at':String(privado.xeradoEnMs) }
    }),
    env.R2_PUBLICO.put(PUBLIC_INDEX_KEY, JSON.stringify(publico), {
      httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'public, max-age=60' },
      customMetadata:{ 'scpp-source':'portal-admin-write-through', 'scpp-generated-at':String(publico.xeradoEnMs) }
    })
  ]);
}

async function actualizarIndicesTrasEscritura(env, cambio) {
  const indice = await lerIndicePrivado(env);
  if (!indice) {
    throw Object.assign(new Error('Non se atopou o índice privado de concertos en R2.'), { code:'R2_INDEX_MISSING' });
  }

  let concertos = [...indice.concertos];
  if (cambio.tipo === 'crear') {
    concertos.push(cambio.concerto);
  } else if (cambio.tipo === 'eliminar') {
    concertos = concertos.filter((item) => String(item?.id || '') !== cambio.idConcerto);
  } else {
    let atopado = false;
    concertos = concertos.map((item) => {
      if (String(item?.id || '') !== cambio.idConcerto) return item;
      atopado = true;
      return { ...item, ...cambio.parche };
    });
    if (!atopado) {
      throw Object.assign(new Error('O concerto actualizado non existe no índice privado de R2.'), { code:'R2_INDEX_NOT_FOUND' });
    }
  }

  await gardarIndices(env, concertos);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return erro(405, 'REQUEST', 'METHOD_NOT_ALLOWED', 'Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return erro(500, 'CONFIG', 'MISSING_CONFIG', 'O servizo non está configurado correctamente.');

  let body;
  try { body = await request.json(); }
  catch { return erro(400, 'REQUEST', 'INVALID_JSON', 'Solicitude non válida.'); }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return erro(503, 'FIREBASE', 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.'); }
  if (!user) return erro(401, 'AUTH', 'INVALID_SESSION', 'A identificación non é válida ou caducou.');

  try {
    const adminOk = await verificarAdministracionR2(env, user);
    if (!adminOk) return erro(403, 'AUTH', 'FORBIDDEN', 'Usuario non autorizado para Administración.');

    const accion = String(body.accion || 'listar').trim();
    if (accion === 'listar') {
      const result = await chamarAppsScript(env, user, 'listarConcertosAdministracionPortal');
      return json(200, { ok:true, nivel:result.nivel || 'Administración', concertos:Array.isArray(result.concertos) ? result.concertos : [] });
    }

    if (accion === 'crear') {
      const data = texto(body.data, 10);
      const nome = texto(body.nome, 250);
      const cidade = texto(body.cidade, 150);
      const lugar = texto(body.lugar, 250);
      const hora = texto(body.hora, 5);
      const caracteristicas = texto(body.caracteristicas, 3000);
      const estado = texto(body.estado, 20) || 'Previsto';
      const mostrarWeb = booleano(body.mostrarWeb);
      const destacadoWeb = booleano(body.destacadoWeb);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !nome || !ESTADOS.has(estado)) {
        return erro(400, 'REQUEST', 'INVALID_DATA', 'Indica polo menos unha data, un nome e un estado válidos.');
      }
      if (hora && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(hora)) return erro(400, 'REQUEST', 'INVALID_DATA', 'A hora debe ter formato HH:MM.');
      if (destacadoWeb && !mostrarWeb) return erro(400, 'REQUEST', 'INVALID_DATA', 'Un concerto destacado debe estar marcado tamén para mostrar na web.');
      const result = await chamarAppsScript(env, user, 'crearConcertoAdministracionPortal', {
        data, nome, cidade, lugar, hora, caracteristicas, estado, mostrarWeb, destacadoWeb
      });
      const idConcerto = String(result?.resultado?.idConcerto || '').trim();
      if (!idConcerto) throw Object.assign(new Error('Apps Script non devolveu o Id do novo concerto.'), { code:'INVALID_UPSTREAM_RESULT' });
      await actualizarIndicesTrasEscritura(env, {
        tipo:'crear',
        concerto:{
          id:idConcerto,
          data,
          nome,
          cidade,
          lugar,
          caracteristicas,
          cartel:'',
          triptico:'',
          prensa:'',
          hora,
          mostrarWeb,
          destacadoWeb,
          estado:estadoIndice(estado),
          numeroConcerto:'',
          ordeHistorica:null,
          dataTextoHistorica:'',
          programa:[]
        }
      });
      return json(200, { ok:true, resultado:result.resultado || result, sincronizacion:'SHEET+R2' });
    }

    if (accion === 'eliminar') {
      const idConcerto = texto(body.idConcerto, 120);
      if (!idConcerto) return erro(400, 'REQUEST', 'INVALID_DATA', 'Indica o concerto que queres dar de baixa.');
      const result = await chamarAppsScript(env, user, 'eliminarConcertoAdministracionPortal', { idConcerto });
      await actualizarIndicesTrasEscritura(env, { tipo:'eliminar', idConcerto });
      return json(200, { ok:true, resultado:result.resultado || result, sincronizacion:'SHEET+R2' });
    }

    if (accion === 'cambiarData') {
      const idConcerto = texto(body.idConcerto, 120);
      const data = texto(body.data, 10);
      if (!idConcerto || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro(400, 'REQUEST', 'INVALID_DATA', 'Indica un concerto e unha data válida.');
      const result = await chamarAppsScript(env, user, 'actualizarConcertoAdministracionPortal', { idConcerto, data });
      await actualizarIndicesTrasEscritura(env, { tipo:'actualizar', idConcerto, parche:{ data } });
      return json(200, { ok:true, resultado:result.resultado || result, sincronizacion:'SHEET+R2' });
    }

    if (accion === 'cambiarEstado') {
      const idConcerto = texto(body.idConcerto, 120);
      const estado = texto(body.estado, 20);
      if (!idConcerto || !ESTADOS.has(estado)) return erro(400, 'REQUEST', 'INVALID_DATA', 'Indica un concerto e un estado válido.');
      const result = await chamarAppsScript(env, user, 'actualizarConcertoAdministracionPortal', { idConcerto, estado });
      await actualizarIndicesTrasEscritura(env, { tipo:'actualizar', idConcerto, parche:{ estado:estadoIndice(estado) } });
      return json(200, { ok:true, resultado:result.resultado || result, sincronizacion:'SHEET+R2' });
    }

    return erro(400, 'REQUEST', 'ACTION_NOT_ALLOWED', 'Acción non permitida.');
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'HAS_RELATIONS' ? 409 : 502;
    return erro(status, code.startsWith('R2_') ? 'R2' : 'APPS_SCRIPT', code, error?.message || 'Non foi posible completar a operación.');
  }
}
