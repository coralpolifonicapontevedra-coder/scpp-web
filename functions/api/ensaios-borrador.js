const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const DRAFT_PREFIX = 'ensaios/borradores-v1/';
const MAIN_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    ...extra
  }
});

const erro = (status, codigo, mensaxe) => json(status, { ok:false, codigo, erro:mensaxe });
const clean = (value) => String(value || '').trim();
const idEnsaioDe = (row) => clean(row?.ensaio || row?.idEnsaio);
const idPersoaDe = (row) => clean(row?.persoa || row?.idPersoa);
const idRepertorioDe = (row) => clean(row?.repertorio || row?.idRepertorio);

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, redirect:'follow', signal:controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ idToken:token })
    },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid:String(user.localId || ''), email:String(user.email).trim().toLowerCase() };
}

function appsScriptUrl(env) {
  const url = clean(env.APPS_SCRIPT_WEBAPP_URL);
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) ? url : '';
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const url = appsScriptUrl(env);
  if (!url) throw Object.assign(new Error('Non está configurada a implementación principal de Apps Script.'), { code:'APPS_SCRIPT_NOT_CONFIGURED' });
  const response = await fetchConLimite(url, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body:JSON.stringify({ token:env.WEB_WRITE_TOKEN, accion, email:user.email, uidFirebase:user.uid, ...datos })
  }, TIMEOUT_APPS_SCRIPT_MS);
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); }
  catch { throw Object.assign(new Error('Apps Script devolveu unha resposta non válida.'), { code:'APPS_SCRIPT_INVALID_RESPONSE' }); }
  if (!response.ok || !result?.ok) {
    const message = result?.erro || `Apps Script respondeu HTTP ${response.status}.`;
    const code = result?.codigo || (response.status === 403 || /non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return result;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function draftKey(idEnsaio) {
  return `${DRAFT_PREFIX}${await sha256(idEnsaio)}.json`;
}

async function mainCacheKey(email) {
  return `${MAIN_CACHE_PREFIX}${await sha256(String(email || '').trim().toLowerCase())}.json`;
}

function normalizarObra(row, idEnsaio, ordeFallback = 999) {
  return {
    ensaio:idEnsaio,
    repertorio:idRepertorioDe(row),
    orde:Number(row?.orde || ordeFallback || 999),
    tipoTraballo:clean(row?.tipoTraballo),
    desde:clean(row?.desde),
    ata:clean(row?.ata),
    observacions:clean(row?.observacions)
  };
}

function normalizarAsistencia(row, idEnsaio) {
  return {
    ensaio:idEnsaio,
    persoa:idPersoaDe(row),
    estadoAsistencia:clean(row?.estadoAsistencia),
    xustificada:row?.xustificada === true || ['true','1','si','sí','yes','x'].includes(clean(row?.xustificada).toLowerCase()),
    motivo:clean(row?.motivo),
    observacions:clean(row?.observacions)
  };
}

function draftDesdePayload(result, idEnsaio) {
  const repertorio = (Array.isArray(result?.ensaiosRepertorio) ? result.ensaiosRepertorio : [])
    .filter((row) => idEnsaioDe(row) === idEnsaio)
    .map((row, index) => normalizarObra(row, idEnsaio, index + 1))
    .filter((row) => row.repertorio);
  const asistencias = (Array.isArray(result?.asistencias) ? result.asistencias : [])
    .filter((row) => idEnsaioDe(row) === idEnsaio)
    .map((row) => normalizarAsistencia(row, idEnsaio))
    .filter((row) => row.persoa);
  return {
    version:1,
    idEnsaio,
    updatedAt:new Date().toISOString(),
    repertorio,
    asistencias,
    baseRepertorio:repertorio.map((row) => ({ ...row })),
    baseAsistencias:asistencias.map((row) => ({ ...row }))
  };
}

function draftValido(value, idEnsaio) {
  return value?.version === 1 && value?.idEnsaio === idEnsaio && Array.isArray(value?.repertorio) && Array.isArray(value?.asistencias);
}

async function lerDraft(env, idEnsaio) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') throw Object.assign(new Error('R2 privado non está dispoñible.'), { code:'R2_NOT_CONFIGURED' });
  const object = await env.R2_PRIVADO.get(await draftKey(idEnsaio));
  if (!object) return null;
  try {
    const value = await object.json();
    return draftValido(value, idEnsaio) ? value : null;
  } catch {
    return null;
  }
}

async function gardarDraft(env, draft) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') throw Object.assign(new Error('R2 privado non está dispoñible.'), { code:'R2_NOT_CONFIGURED' });
  const value = { ...draft, updatedAt:new Date().toISOString() };
  await env.R2_PRIVADO.put(await draftKey(value.idEnsaio), JSON.stringify(value), {
    httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' }
  });
  return value;
}

async function lerEntradaPrincipalR2(env, user) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  try {
    const object = await env.R2_PRIVADO.get(await mainCacheKey(user.email));
    if (!object) return null;
    const entry = await object.json();
    if (entry?.email !== user.email || entry?.payload?.ok !== true || entry?.payload?.version !== 2) return null;
    return entry;
  } catch (error) {
    console.warn('Non se puido ler o índice principal de R2:', error);
    return null;
  }
}

async function lerPayloadPrincipalR2(env, user) {
  return (await lerEntradaPrincipalR2(env, user))?.payload || null;
}

async function gardarPayloadPrincipalR2(env, user, payload) {
  const key = await mainCacheKey(user.email);
  await env.R2_PRIVADO.put(key, JSON.stringify({ savedAt:Date.now(), email:user.email, payload }), {
    httpMetadata:{ contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' }
  });
}

async function obterOuCrearDraft(env, user, idEnsaio) {
  const existing = await lerDraft(env, idEnsaio);
  if (existing) return existing;
  return reiniciarDraft(env, user, idEnsaio);
}

async function reiniciarDraft(env, user, idEnsaio) {
  const payloadR2 = await lerPayloadPrincipalR2(env, user);
  if (!payloadR2) throw Object.assign(new Error('Non hai un índice R2 de Ensaios dispoñible para iniciar a edición.'), { code:'R2_SEED_MISSING' });
  return gardarDraft(env, draftDesdePayload(payloadR2, idEnsaio));
}

async function executarSecuencial(items, worker) {
  for (const item of items) await worker(item);
}

function obraIgual(a, b) {
  return clean(a?.tipoTraballo) === clean(b?.tipoTraballo)
    && clean(a?.desde) === clean(b?.desde)
    && clean(a?.ata) === clean(b?.ata)
    && clean(a?.observacions) === clean(b?.observacions);
}

function asistenciaIgual(a, b) {
  const aa = normalizarAsistencia(a || {}, idEnsaioDe(a));
  const bb = normalizarAsistencia(b || {}, idEnsaioDe(b));
  return aa.estadoAsistencia === bb.estadoAsistencia
    && aa.xustificada === bb.xustificada
    && aa.motivo === bb.motivo
    && aa.observacions === bb.observacions;
}

async function actualizarIndicePrincipalDesdeDraft(env, user, idEnsaio, draft) {
  const entry = await lerEntradaPrincipalR2(env, user);
  if (!entry?.payload) throw Object.assign(new Error('Non foi posible actualizar o índice principal de R2.'), { code:'R2_MAIN_MISSING' });
  const previo = entry.payload;
  const repertorioEnsaio = draft.repertorio.map((row, index) => ({
    idEnsaioRepertorio:'',
    ensaio:idEnsaio,
    repertorio:idRepertorioDe(row),
    orde:Number(row.orde) || index + 1,
    tipoTraballo:clean(row.tipoTraballo),
    desde:clean(row.desde),
    ata:clean(row.ata),
    observacions:clean(row.observacions)
  })).filter((row) => row.repertorio);
  const asistenciasEnsaio = draft.asistencias.map((row) => ({
    idAsistenciaEnsaio:'',
    ensaio:idEnsaio,
    persoa:idPersoaDe(row),
    estadoAsistencia:clean(row.estadoAsistencia),
    xustificada:row.xustificada === true,
    motivo:clean(row.motivo),
    observacions:clean(row.observacions)
  })).filter((row) => row.persoa);
  const ensaiosRepertorio = (Array.isArray(previo.ensaiosRepertorio) ? previo.ensaiosRepertorio : [])
    .filter((row) => idEnsaioDe(row) !== idEnsaio)
    .concat(repertorioEnsaio);
  const asistencias = (Array.isArray(previo.asistencias) ? previo.asistencias : [])
    .filter((row) => idEnsaioDe(row) !== idEnsaio)
    .concat(asistenciasEnsaio);
  const ensaios = (Array.isArray(previo.ensaios) ? previo.ensaios : []).map((row) => {
    if (clean(row.idEnsaio || row.id) !== idEnsaio) return row;
    return { ...row, obras:repertorioEnsaio.length, asistencias:asistenciasEnsaio.length };
  });
  const payload = {
    ...previo,
    ensaios,
    ensaiosRepertorio,
    asistencias,
    xeradoEn:new Date().toISOString()
  };
  await gardarPayloadPrincipalR2(env, user, payload);
  return payload;
}

async function finalizar(env, user, idEnsaio) {
  const draft = await obterOuCrearDraft(env, user, idEnsaio);
  const baseRepertorio = Array.isArray(draft.baseRepertorio) ? draft.baseRepertorio : [];
  const baseAsistencias = Array.isArray(draft.baseAsistencias) ? draft.baseAsistencias : [];
  const baseWorks = new Map(baseRepertorio.map((row) => [idRepertorioDe(row), row]));
  const draftWorks = new Map(draft.repertorio.map((row) => [idRepertorioDe(row), row]));
  const baseAttendance = new Map(baseAsistencias.map((row) => [idPersoaDe(row), row]));

  const eliminar = [...baseWorks.keys()].filter((id) => id && !draftWorks.has(id));
  const gardarObras = [...draftWorks.values()].filter((row) => {
    const current = baseWorks.get(idRepertorioDe(row));
    return !current || !obraIgual(current, row);
  });
  const gardarAsistencias = draft.asistencias.filter((row) => {
    const current = baseAttendance.get(idPersoaDe(row));
    return !current || !asistenciaIgual(current, row);
  });

  await executarSecuencial(eliminar, (idRepertorio) => chamarAppsScript(env, user, 'eliminarEnsaioRepertorioPortal', { idEnsaio, idRepertorio }));
  await executarSecuencial(gardarObras, (row) => chamarAppsScript(env, user, 'gardarEnsaioRepertorioPortal', {
    idEnsaio,
    idRepertorio:idRepertorioDe(row),
    tipoTraballo:clean(row.tipoTraballo),
    desde:clean(row.desde),
    ata:clean(row.ata),
    observacions:clean(row.observacions)
  }));
  await executarSecuencial(gardarAsistencias, (row) => chamarAppsScript(env, user, 'gardarAsistenciaEnsaioPortal', {
    idEnsaio,
    idPersoa:idPersoaDe(row),
    estadoAsistencia:clean(row.estadoAsistencia),
    xustificada:row.xustificada === true,
    motivo:clean(row.motivo),
    observacions:clean(row.observacions)
  }));

  await actualizarIndicePrincipalDesdeDraft(env, user, idEnsaio, draft);
  const synced = await gardarDraft(env, {
    ...draft,
    baseRepertorio:draft.repertorio.map((row) => ({ ...row })),
    baseAsistencias:draft.asistencias.map((row) => ({ ...row }))
  });
  return {
    draft:synced,
    resumo:{ obrasGardadas:gardarObras.length, obrasEliminadas:eliminar.length, asistenciasGardadas:gardarAsistencias.length }
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return erro(405, 'METHOD_NOT_ALLOWED', 'Método non permitido.');
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY || !env.R2_PRIVADO) return erro(500, 'MISSING_CONFIG', 'O servizo non está configurado correctamente.');

  let body;
  try { body = await request.json(); }
  catch { return erro(400, 'INVALID_JSON', 'Solicitude non válida.'); }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch (error) {
    console.error('Erro ao validar Firebase no borrador de ensaios:', error);
    return erro(503, 'FIREBASE_UNAVAILABLE', 'Non foi posible validar a sesión.');
  }
  if (!user) return erro(401, 'INVALID_SESSION', 'A identificación non é válida ou caducou.');

  const accion = clean(body.accion || 'obter');
  const idEnsaio = clean(body.idEnsaio);
  if (!idEnsaio) return erro(400, 'INVALID_DATA', 'Falta identificar o ensaio.');

  try {
    if (accion === 'reiniciar') {
      const draft = await reiniciarDraft(env, user, idEnsaio);
      return json(200, { ok:true, draft, almacen:'R2' }, { 'X-SCPP-Storage':'R2-DRAFT' });
    }

    let draft = await obterOuCrearDraft(env, user, idEnsaio);

    if (accion === 'obter') return json(200, { ok:true, draft, almacen:'R2' }, { 'X-SCPP-Storage':'R2-DRAFT' });

    if (accion === 'gardarAsistencia') {
      const idPersoa = clean(body.idPersoa);
      if (!idPersoa) return erro(400, 'INVALID_DATA', 'Falta identificar a persoa.');
      const row = normalizarAsistencia({
        persoa:idPersoa,
        estadoAsistencia:body.estadoAsistencia,
        xustificada:body.xustificada,
        motivo:body.motivo,
        observacions:body.observacions
      }, idEnsaio);
      const map = new Map(draft.asistencias.map((item) => [idPersoaDe(item), item]));
      map.set(idPersoa, row);
      draft = await gardarDraft(env, { ...draft, asistencias:[...map.values()] });
      return json(200, { ok:true, draft, almacen:'R2' }, { 'X-SCPP-Storage':'R2-DRAFT' });
    }

    if (accion === 'gardarAsistencias') {
      const persoas = Array.isArray(body.persoas) ? body.persoas.slice(0, 120) : [];
      const map = new Map(draft.asistencias.map((item) => [idPersoaDe(item), item]));
      let gardadas = 0;
      for (const p of persoas) {
        const idPersoa = clean(p.id || p.idPersoa);
        const estado = clean(p.estado);
        if (!idPersoa || !['asiste','non_asiste','xustificada'].includes(estado)) continue;
        map.set(idPersoa, normalizarAsistencia({
          persoa:idPersoa,
          estadoAsistencia:estado === 'asiste' ? 'Asiste' : 'Non asiste',
          xustificada:estado === 'xustificada',
          motivo:estado === 'xustificada' ? clean(p.xustificacion) : '',
          observacions:estado === 'xustificada' ? clean(p.xustificacion) : ''
        }, idEnsaio));
        gardadas += 1;
      }
      draft = await gardarDraft(env, { ...draft, asistencias:[...map.values()] });
      return json(200, { ok:true, draft, gardadas, almacen:'R2' }, { 'X-SCPP-Storage':'R2-DRAFT' });
    }

    if (accion === 'gardarObra') {
      const idRepertorio = clean(body.idRepertorio);
      if (!idRepertorio) return erro(400, 'INVALID_DATA', 'Falta identificar a obra.');
      const map = new Map(draft.repertorio.map((item) => [idRepertorioDe(item), item]));
      const previous = map.get(idRepertorio) || {};
      map.set(idRepertorio, normalizarObra({
        ...previous,
        repertorio:idRepertorio,
        orde:body.orde || previous.orde || map.size + 1,
        tipoTraballo:body.tipoTraballo,
        desde:body.desde,
        ata:body.ata,
        observacions:body.observacions
      }, idEnsaio, map.size + 1));
      draft = await gardarDraft(env, { ...draft, repertorio:[...map.values()] });
      return json(200, { ok:true, draft, almacen:'R2' }, { 'X-SCPP-Storage':'R2-DRAFT' });
    }

    if (accion === 'eliminarObra') {
      const idRepertorio = clean(body.idRepertorio);
      if (!idRepertorio) return erro(400, 'INVALID_DATA', 'Falta identificar a obra.');
      draft = await gardarDraft(env, { ...draft, repertorio:draft.repertorio.filter((row) => idRepertorioDe(row) !== idRepertorio) });
      return json(200, { ok:true, draft, almacen:'R2' }, { 'X-SCPP-Storage':'R2-DRAFT' });
    }

    if (accion === 'incluírPrograma') {
      const ids = [...new Set((Array.isArray(body.idsRepertorio) ? body.idsRepertorio : []).map(clean).filter(Boolean))].slice(0, 80);
      const map = new Map(draft.repertorio.map((item) => [idRepertorioDe(item), item]));
      let engadidas = 0;
      for (const idRepertorio of ids) {
        if (map.has(idRepertorio)) continue;
        map.set(idRepertorio, normalizarObra({ repertorio:idRepertorio, orde:map.size + 1 }, idEnsaio, map.size + 1));
        engadidas += 1;
      }
      draft = await gardarDraft(env, { ...draft, repertorio:[...map.values()] });
      return json(200, { ok:true, draft, engadidas, almacen:'R2' }, { 'X-SCPP-Storage':'R2-DRAFT' });
    }

    if (accion === 'finalizar') {
      const result = await finalizar(env, user, idEnsaio);
      return json(200, { ok:true, ...result, almacen:'SHEET+R2' }, { 'X-SCPP-Storage':'SHEET+R2' });
    }

    return erro(400, 'ACTION_NOT_ALLOWED', 'Acción non permitida.');
  } catch (error) {
    console.error('Erro no borrador compartido de ensaios:', error);
    if (error?.code === 'FORBIDDEN') return erro(403, 'FORBIDDEN', 'Non tes permisos para realizar esta operación.');
    if (error?.name === 'AbortError') return erro(504, 'TIMEOUT', 'O servizo de datos tardou demasiado en responder.');
    return erro(503, error?.code || 'UNAVAILABLE', error instanceof Error ? error.message : 'Non foi posible completar a operación.');
  }
}
