import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const ENSAIOS_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';
const ADMIN_V2_PREFIX = 'ensaios/admin-v2/';
const BASE_TTL_MS = 10 * 60 * 1000;

const clean = (value) => String(value || '').trim();
const branch = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const baseKey = (env) => `${ADMIN_V2_PREFIX}${branch(env)}/base.json`;
const concertosKey = (env) => `${ADMIN_V2_PREFIX}${branch(env)}/concertos.json`;
const listKey = (env) => `${ADMIN_V2_PREFIX}${branch(env)}/list.json`;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

const tokenCache = new Map();
async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const cached = tokenCache.get(token);
  if (cached?.expires > Date.now()) return cached.user;
  const response = await fetchConLimite(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
  }, TIMEOUT_FIREBASE_MS);
  if (!response.ok) return null;
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  const user = { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
  tokenCache.set(token, { user, expires: Date.now() + 5 * 60 * 1000 });
  while (tokenCache.size > 100) tokenCache.delete(tokenCache.keys().next().value);
  return user;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function verificarAdministracionR2(env, user) {
  if (!env.R2_PRIVADO?.get) return false;
  const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const entry = await object.json().catch(() => null);
  return entry?.administrador === user.email && entry?.payload?.perfil?.nivel === 'Administración';
}

async function chamarAppsScript(env, user, accion, datos = {}) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: user.email,
    uidFirebase: user.uid,
    ...datos
  }, { timeoutMs: TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs: 8_000 });
  if (!resultado?.ok) {
    const message = resultado?.erro || 'Apps Script non puido completar a operación.';
    const code = resultado?.codigo || (/non autorizado/i.test(message) ? 'FORBIDDEN' : 'APPS_SCRIPT_RESULT');
    throw Object.assign(new Error(message), { code });
  }
  return resultado;
}

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function writeJson(bucket, key, value, tipo = 'ensaios-admin-v2') {
  if (!bucket?.put) return;
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo, version: '2' }
  });
}

function cacheValida(entry) {
  if (!entry?.payload || !entry?.createdAt) return false;
  const age = Date.now() - Date.parse(entry.createdAt);
  return Number.isFinite(age) && age >= 0 && age <= BASE_TTL_MS;
}

async function obterBase(env, user, forzar = false) {
  if (!forzar) {
    const cached = await readJson(env.R2_PRIVADO, baseKey(env));
    if (cacheValida(cached)) return { payload: cached.payload, fonte: 'R2' };
  }
  const payload = await chamarAppsScript(env, user, 'listarEnsaiosPortal');
  await writeJson(env.R2_PRIVADO, baseKey(env), { createdAt: new Date().toISOString(), payload }).catch(() => {});
  return { payload, fonte: 'APPS_SCRIPT' };
}

async function obterConcertos(env, user, forzar = false) {
  if (!forzar) {
    const cached = await readJson(env.R2_PRIVADO, concertosKey(env));
    if (cacheValida(cached)) return { payload: cached.payload, fonte: 'R2' };
  }
  const result = await chamarAppsScript(env, user, 'listarConcertosAdministracionPortal');
  const payload = Array.isArray(result.concertos) ? result.concertos : [];
  await writeJson(env.R2_PRIVADO, concertosKey(env), { createdAt: new Date().toISOString(), payload }, 'ensaios-admin-v2-concertos').catch(() => {});
  return { payload, fonte: 'APPS_SCRIPT' };
}

async function invalidarLista(env) {
  if (env.R2_PRIVADO?.delete) await env.R2_PRIVADO.delete(listKey(env)).catch(() => {});
  if (!env.R2_PRIVADO?.list || !env.R2_PRIVADO?.delete) return;
  let cursor;
  do {
    const page = await env.R2_PRIVADO.list({ prefix: ENSAIOS_CACHE_PREFIX, cursor });
    const keys = (page.objects || []).map((item) => item.key);
    if (keys.length) await env.R2_PRIVADO.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

function prepararPersoas(result, idEnsaio) {
  const persoas = Array.isArray(result.persoas) ? result.persoas : [];
  const asistencias = Array.isArray(result.asistencias) ? result.asistencias : [];
  const porPersoa = new Map();
  asistencias.filter((a) => clean(a.ensaio) === idEnsaio).forEach((a) => porPersoa.set(clean(a.persoa), a));
  return persoas.map((p) => {
    const id = clean(p.idPersoa || p.id);
    const a = porPersoa.get(id) || null;
    let estado = '';
    if (a) estado = a.xustificada === true ? 'xustificada' : clean(a.estadoAsistencia).toLowerCase() === 'asiste' ? 'asiste' : 'non_asiste';
    return {
      id,
      nome: clean(p.nome),
      primeiroApelido: clean(p.primeiroApelido),
      segundoApelido: clean(p.segundoApelido),
      nomeCompleto: clean(p.nomeCompleto),
      voz: clean(p.voz),
      estado,
      xustificacion: clean(a?.motivo || a?.observacions)
    };
  }).filter((p) => p.id && p.voz);
}

function prepararObras(result, idEnsaio) {
  const catalogo = Array.isArray(result.repertorio) ? result.repertorio : [];
  const relacions = Array.isArray(result.ensaiosRepertorio) ? result.ensaiosRepertorio : [];
  const map = new Map(catalogo.map((obra) => [clean(obra.idRepertorio), obra]));
  const obras = relacions
    .filter((row) => clean(row.ensaio) === idEnsaio)
    .map((row) => {
      const id = clean(row.repertorio);
      const obra = map.get(id) || {};
      return {
        idRepertorio: id,
        nomeObra: clean(obra.nomeObra) || id,
        compositor: clean(obra.compositor),
        orde: Number(row.orde) || 0,
        tipoTraballo: clean(row.tipoTraballo),
        observacions: clean(row.observacions)
      };
    })
    .sort((a, b) => (a.orde || 9999) - (b.orde || 9999) || a.nomeObra.localeCompare(b.nomeObra, 'gl'));
  const repertorio = catalogo
    .map((obra) => ({ idRepertorio: clean(obra.idRepertorio), nomeObra: clean(obra.nomeObra), compositor: clean(obra.compositor) }))
    .filter((obra) => obra.idRepertorio && obra.nomeObra)
    .sort((a, b) => a.nomeObra.localeCompare(b.nomeObra, 'gl'));
  return { obras, repertorio };
}

async function actualizarBaseAsistencias(env, idEnsaio, persoas) {
  const entry = await readJson(env.R2_PRIVADO, baseKey(env));
  if (!entry?.payload) return;
  const actual = Array.isArray(entry.payload.asistencias) ? entry.payload.asistencias : [];
  const ids = new Set(persoas.map((p) => clean(p.id)).filter(Boolean));
  const restantes = actual.filter((a) => !(clean(a.ensaio) === idEnsaio && ids.has(clean(a.persoa))));
  const novas = persoas.map((p) => ({
    idAsistenciaEnsaio: '',
    ensaio: idEnsaio,
    persoa: clean(p.id),
    estadoAsistencia: clean(p.estado) === 'asiste' ? 'Asiste' : 'Non asiste',
    xustificada: clean(p.estado) === 'xustificada',
    motivo: clean(p.estado) === 'xustificada' ? clean(p.xustificacion) : '',
    observacions: clean(p.estado) === 'xustificada' ? clean(p.xustificacion) : ''
  }));
  entry.payload.asistencias = restantes.concat(novas);
  entry.createdAt = new Date().toISOString();
  await writeJson(env.R2_PRIVADO, baseKey(env), entry).catch(() => {});
}

async function actualizarBaseObra(env, idEnsaio, idRepertorio) {
  const entry = await readJson(env.R2_PRIVADO, baseKey(env));
  if (!entry?.payload) return;
  const rel = Array.isArray(entry.payload.ensaiosRepertorio) ? entry.payload.ensaiosRepertorio : [];
  const existe = rel.some((r) => clean(r.ensaio) === idEnsaio && clean(r.repertorio) === idRepertorio);
  if (!existe) rel.push({ idEnsaioRepertorio: '', ensaio: idEnsaio, repertorio: idRepertorio, orde: rel.filter((r) => clean(r.ensaio) === idEnsaio).length + 1 });
  entry.payload.ensaiosRepertorio = rel;
  entry.createdAt = new Date().toISOString();
  await writeJson(env.R2_PRIVADO, baseKey(env), entry).catch(() => {});
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'O servizo non está configurado.' });
  const body = await request.json().catch(() => null);
  if (!body) return json(400, { ok: false, erro: 'Solicitude non válida.' });

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user).catch(() => false))) return json(403, { ok: false, erro: 'Usuario non autorizado para Administración.' });

  const accion = clean(body.accion);
  const idEnsaio = clean(body.idEnsaio);
  if (!idEnsaio) return json(400, { ok: false, erro: 'Falta identificar o ensaio.' });

  try {
    if (accion === 'obterXestion') {
      const { payload, fonte } = await obterBase(env, user);
      return json(200, { ok: true, persoas: prepararPersoas(payload, idEnsaio), fonte });
    }

    if (accion === 'obterObras') {
      const [base, concertos] = await Promise.all([obterBase(env, user), obterConcertos(env, user)]);
      const obraData = prepararObras(base.payload, idEnsaio);
      return json(200, {
        ok: true,
        ...obraData,
        concertos: concertos.payload.map((c) => ({
          idConcerto: clean(c.idConcerto),
          data: clean(c.data),
          nome: clean(c.nome) || 'Concerto',
          repertorio: Array.isArray(c.repertorio) ? c.repertorio : []
        })).filter((c) => c.idConcerto),
        fonte: `${base.fonte}/${concertos.fonte}`
      });
    }

    if (accion === 'gardarAsistencias') {
      const persoas = Array.isArray(body.persoas) ? body.persoas.slice(0, 100) : [];
      let gardadas = 0;
      for (const p of persoas) {
        const idPersoa = clean(p.id);
        const estado = clean(p.estado);
        if (!idPersoa || !['asiste', 'non_asiste', 'xustificada'].includes(estado)) continue;
        await chamarAppsScript(env, user, 'gardarAsistenciaEnsaioPortal', {
          idEnsaio,
          idPersoa,
          estadoAsistencia: estado === 'asiste' ? 'Asiste' : 'Non asiste',
          xustificada: estado === 'xustificada',
          motivo: estado === 'xustificada' ? clean(p.xustificacion) : '',
          observacions: estado === 'xustificada' ? clean(p.xustificacion) : ''
        });
        gardadas += 1;
      }
      await actualizarBaseAsistencias(env, idEnsaio, persoas.filter((p) => p.id && p.estado));
      await invalidarLista(env);
      return json(200, { ok: true, gardadas });
    }

    if (accion === 'gardarObra') {
      const idRepertorio = clean(body.idRepertorio);
      if (!idRepertorio) return json(400, { ok: false, erro: 'Selecciona unha obra do repertorio.' });
      await chamarAppsScript(env, user, 'gardarEnsaioRepertorioPortal', {
        idEnsaio,
        idRepertorio,
        tipoTraballo: clean(body.tipoTraballo),
        observacions: clean(body.observacions)
      });
      await actualizarBaseObra(env, idEnsaio, idRepertorio);
      await invalidarLista(env);
      return json(200, { ok: true, idRepertorio });
    }

    if (accion === 'importarPrograma') {
      const idConcerto = clean(body.idConcerto);
      if (!idConcerto) return json(400, { ok: false, erro: 'Selecciona un concerto.' });
      const { payload: concertos } = await obterConcertos(env, user);
      const concerto = concertos.find((c) => clean(c.idConcerto) === idConcerto);
      if (!concerto) return json(404, { ok: false, erro: 'Non se atopou o concerto seleccionado.' });
      const programa = Array.isArray(concerto.repertorio) ? concerto.repertorio : [];
      let engadidas = 0;
      for (const obra of programa) {
        const idRepertorio = clean(obra.idRepertorio || obra.obraId);
        if (!idRepertorio) continue;
        await chamarAppsScript(env, user, 'gardarEnsaioRepertorioPortal', {
          idEnsaio,
          idRepertorio,
          observacions: clean(obra.notas)
        });
        await actualizarBaseObra(env, idEnsaio, idRepertorio);
        engadidas += 1;
      }
      await invalidarLista(env);
      return json(200, { ok: true, engadidas, concerto: clean(concerto.nome) });
    }

    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    const code = error?.code || 'UPSTREAM';
    const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 502;
    return json(status, { ok: false, codigo: code, erro: error?.message || 'Non foi posible completar a operación.' });
  }
}
