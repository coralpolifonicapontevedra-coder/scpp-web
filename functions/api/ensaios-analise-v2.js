import { obterJsonAppsScript } from '../_lib/apps-script.js';

const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const ADMIN_V2_PREFIX = 'ensaios/admin-v2/';
const BASE_TTL_MS = 10 * 60 * 1000;

const clean = (value) => String(value || '').trim();
const branch = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const baseKey = (env) => `${ADMIN_V2_PREFIX}${branch(env)}/base.json`;
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

async function chamarAppsScript(env, user) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarEnsaiosPortal',
    email: user.email,
    uidFirebase: user.uid
  }, { timeoutMs: TIMEOUT_APPS_SCRIPT_MS, attemptTimeoutMs: 8_000 });
  if (!resultado?.ok) throw Object.assign(new Error(resultado?.erro || 'Non foi posible cargar os datos de ensaios.'), { code: resultado?.codigo || 'UPSTREAM' });
  return resultado;
}

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function writeJson(bucket, key, value) {
  if (!bucket?.put) return;
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { tipo: 'ensaios-admin-v2-analise', version: '2' }
  });
}

async function obterBase(env, user) {
  const cached = await readJson(env.R2_PRIVADO, baseKey(env));
  if (cached?.payload && cached?.createdAt) {
    const age = Date.now() - Date.parse(cached.createdAt);
    if (Number.isFinite(age) && age >= 0 && age <= BASE_TTL_MS) return { payload: cached.payload, fonte: 'R2' };
  }
  const payload = await chamarAppsScript(env, user);
  await writeJson(env.R2_PRIVADO, baseKey(env), { createdAt: new Date().toISOString(), payload }).catch(() => {});
  return { payload, fonte: 'APPS_SCRIPT' };
}

function booleano(value) {
  return value === true || ['true', '1', 'si', 'sí', 'yes', 'x'].includes(clean(value).toLowerCase());
}

function nomePersoa(p) {
  return [clean(p.primeiroApelido), clean(p.segundoApelido), clean(p.nome)].filter(Boolean).join(' ') || clean(p.nomeCompleto) || clean(p.idPersoa);
}

function normal(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function persoasBase(base) {
  return (Array.isArray(base.persoas) ? base.persoas : []).map((p) => ({
    id: clean(p.idPersoa || p.id),
    nome: nomePersoa(p),
    voz: clean(p.voz)
  })).filter((p) => p.id && p.voz);
}

function obterFiltrosDisponibles(base) {
  const persoas = persoasBase(base).sort((a, b) => a.nome.localeCompare(b.nome, 'gl'));
  const ensaios = Array.isArray(base.ensaios) ? base.ensaios : [];
  const tipos = [...new Set(ensaios.map((e) => clean(e.tipoEnsaio)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'gl'));
  const concertosMap = new Map();
  ensaios.forEach((e) => {
    const id = clean(e.concerto);
    if (!id) return;
    concertosMap.set(id, clean(e.concertoNome) || id);
  });
  const concertos = Array.from(concertosMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'gl'));
  const vocesPreferidas = ['Soprano', 'Contralto', 'Tenor', 'Baixo'];
  const vocesPresentes = [...new Set(persoas.map((p) => p.voz).filter(Boolean))];
  const voces = vocesPreferidas.filter((v) => vocesPresentes.some((x) => normal(x) === normal(v)))
    .concat(vocesPresentes.filter((v) => !vocesPreferidas.some((x) => normal(x) === normal(v))).sort((a, b) => a.localeCompare(b, 'gl')));
  return { voces, persoas, tipos, concertos };
}

function analizar(base, filtros) {
  const { desde, ata, voz, persoa, tipoEnsaio, concerto } = filtros;
  const ensaios = (Array.isArray(base.ensaios) ? base.ensaios : []).filter((e) => {
    const data = clean(e.data).slice(0, 10);
    if (!data || booleano(e.cancelado)) return false;
    if (desde && data < desde) return false;
    if (ata && data > ata) return false;
    if (tipoEnsaio && normal(e.tipoEnsaio) !== normal(tipoEnsaio)) return false;
    if (concerto && clean(e.concerto) !== concerto) return false;
    return true;
  });

  const idsEnsaios = new Set(ensaios.map((e) => clean(e.idEnsaio)).filter(Boolean));
  const persoas = persoasBase(base).filter((p) => {
    if (voz && normal(p.voz) !== normal(voz)) return false;
    if (persoa && p.id !== persoa) return false;
    return true;
  });
  const persoasMap = new Map(persoas.map((p) => [p.id, p]));
  const asistencias = (Array.isArray(base.asistencias) ? base.asistencias : []).filter((a) => idsEnsaios.has(clean(a.ensaio)) && persoasMap.has(clean(a.persoa)));

  const estat = new Map(persoas.map((p) => [p.id, { ...p, ensaios: ensaios.length, rexistrados: 0, asiste: 0, nonAsiste: 0, xustificadas: 0, senXustificar: 0, porcentaxe: 0 }]));
  for (const a of asistencias) {
    const row = estat.get(clean(a.persoa));
    if (!row) continue;
    const estado = normal(a.estadoAsistencia);
    if (estado !== 'asiste' && estado !== 'non asiste') continue;
    row.rexistrados += 1;
    if (estado === 'asiste') row.asiste += 1;
    else {
      row.nonAsiste += 1;
      if (booleano(a.xustificada)) row.xustificadas += 1;
      else row.senXustificar += 1;
    }
  }
  const persoasStats = Array.from(estat.values()).map((row) => ({ ...row, porcentaxe: row.rexistrados ? Math.round(row.asiste * 100 / row.rexistrados) : 0 }));

  const vocesAnalise = [...new Set(persoas.map((p) => p.voz))];
  const porVoz = vocesAnalise.map((vozNome) => {
    const rows = persoasStats.filter((p) => normal(p.voz) === normal(vozNome));
    const asiste = rows.reduce((sum, p) => sum + p.asiste, 0);
    const rexistrados = rows.reduce((sum, p) => sum + p.rexistrados, 0);
    return { voz: vozNome, persoas: rows.length, asiste, rexistrados, porcentaxe: rexistrados ? Math.round(asiste * 100 / rexistrados) : 0 };
  });

  const porEnsaio = ensaios.map((e) => {
    const id = clean(e.idEnsaio);
    const rows = asistencias.filter((a) => clean(a.ensaio) === id && ['asiste', 'non asiste'].includes(normal(a.estadoAsistencia)));
    const presentes = rows.filter((a) => normal(a.estadoAsistencia) === 'asiste').length;
    return {
      idEnsaio: id,
      data: clean(e.data).slice(0, 10),
      tipoEnsaio: clean(e.tipoEnsaio) || 'Ensaio',
      concertoNome: clean(e.concertoNome),
      presentes,
      rexistrados: rows.length,
      porcentaxe: rows.length ? Math.round(presentes * 100 / rows.length) : 0
    };
  }).sort((a, b) => a.data.localeCompare(b.data));

  const mesesMap = new Map();
  for (const row of porEnsaio) {
    const mes = row.data.slice(0, 7);
    if (!mesesMap.has(mes)) mesesMap.set(mes, { mes, presentes: 0, rexistrados: 0 });
    const target = mesesMap.get(mes);
    target.presentes += row.presentes;
    target.rexistrados += row.rexistrados;
  }
  const porMes = Array.from(mesesMap.values()).map((m) => ({ ...m, porcentaxe: m.rexistrados ? Math.round(m.presentes * 100 / m.rexistrados) : 0 }));

  const conDatos = persoasStats.filter((p) => p.rexistrados > 0);
  const maiores = [...conDatos].sort((a, b) => b.porcentaxe - a.porcentaxe || b.rexistrados - a.rexistrados || a.nome.localeCompare(b.nome, 'gl')).slice(0, 10);
  const menores = [...conDatos].sort((a, b) => a.porcentaxe - b.porcentaxe || b.rexistrados - a.rexistrados || a.nome.localeCompare(b.nome, 'gl')).slice(0, 10);
  const totalPresentes = conDatos.reduce((sum, p) => sum + p.asiste, 0);
  const totalRexistrados = conDatos.reduce((sum, p) => sum + p.rexistrados, 0);
  const totalXustificadas = conDatos.reduce((sum, p) => sum + p.xustificadas, 0);
  const totalSenXustificar = conDatos.reduce((sum, p) => sum + p.senXustificar, 0);

  const ensaiosConDatos = porEnsaio.filter((e) => e.rexistrados > 0);
  const mellorEnsaio = [...ensaiosConDatos].sort((a, b) => b.porcentaxe - a.porcentaxe)[0] || null;
  const peorEnsaio = [...ensaiosConDatos].sort((a, b) => a.porcentaxe - b.porcentaxe)[0] || null;

  return {
    resumo: {
      ensaios: ensaios.length,
      persoas: persoas.length,
      asistenciaMedia: totalRexistrados ? Math.round(totalPresentes * 100 / totalRexistrados) : 0,
      presentes: totalPresentes,
      rexistrados: totalRexistrados,
      xustificadas: totalXustificadas,
      senXustificar: totalSenXustificar,
      mellorEnsaio,
      peorEnsaio
    },
    porVoz,
    maiores,
    menores,
    persoas: [...persoasStats].sort((a, b) => a.nome.localeCompare(b.nome, 'gl')),
    porEnsaio,
    porMes
  };
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

  const filtros = {
    desde: /^\d{4}-\d{2}-\d{2}$/.test(clean(body.desde)) ? clean(body.desde) : '',
    ata: /^\d{4}-\d{2}-\d{2}$/.test(clean(body.ata)) ? clean(body.ata) : '',
    voz: clean(body.voz),
    persoa: clean(body.persoa),
    tipoEnsaio: clean(body.tipoEnsaio),
    concerto: clean(body.concerto)
  };
  if (filtros.desde && filtros.ata && filtros.desde > filtros.ata) return json(400, { ok: false, erro: 'A data inicial non pode ser posterior á data final.' });

  try {
    const { payload, fonte } = await obterBase(env, user);
    return json(200, {
      ok: true,
      fonte,
      filtros,
      filtrosDisponibles: obterFiltrosDisponibles(payload),
      ...analizar(payload, filtros)
    });
  } catch (error) {
    return json(error?.code === 'FORBIDDEN' ? 403 : 502, { ok: false, erro: error?.message || 'Non foi posible calcular a análise.' });
  }
}
