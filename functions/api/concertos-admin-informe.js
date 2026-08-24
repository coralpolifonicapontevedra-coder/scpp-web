const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const CONCERT_INDEX_KEY = 'indices/preview/concertos-privado-v1.json';
const ATTENDANCE_INDEX_KEY = 'indices/preview/asistencias-concertos.json';
const REPORT_KEY = 'indices/preview/informe-asistencia-concertos-v1.json';

const clean = (value) => String(value ?? '').trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const data = (await response.json())?.users?.[0];
  if (!data?.email || data.emailVerified !== true) return null;
  return { uid: clean(data.localId), email: clean(data.email).toLowerCase() };
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function verificarAdministracionR2(env, user) {
  const object = await env.R2_PRIVADO?.get?.(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const entry = await object.json().catch(() => null);
  return entry?.administrador === user.email && entry?.payload?.perfil?.nivel === 'Administración';
}

async function lerJson(bucket, key) {
  const object = await bucket?.get?.(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

function ordeVoz(voz) {
  const orde = ['Soprano', 'Contralto', 'Tenor', 'Baixo'];
  const index = orde.indexOf(clean(voz));
  return index < 0 ? 99 : index;
}

function dataCanon(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  return local ? `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}` : '';
}

function dataValida(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function estadoRealizado(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'realizado';
}

function crearInforme(indiceConcertos, indiceAsistencias, user, inicio, fin) {
  const concertos = Array.isArray(indiceConcertos?.concertos) ? indiceConcertos.concertos : [];
  const porId = new Map(concertos.map((c) => [clean(c?.id), c]));
  const porConcertoCompleto = indiceAsistencias?.resultado?.asistenciasPorConcerto || {};
  const porConcertoPeriodo = {};
  const persoas = new Map();
  let totalAsistencias = 0;
  let concertosConAsistencia = 0;
  let concertosRealizadosPeriodo = 0;

  for (const concerto of concertos) {
    const id = clean(concerto?.id);
    const data = dataCanon(concerto?.data);
    if (!id || id.startsWith('hist-') || !estadoRealizado(concerto?.estado) || !data || data < inicio || data > fin) continue;
    concertosRealizadosPeriodo += 1;
  }

  for (const [idRaw, asistentesRaw] of Object.entries(porConcertoCompleto)) {
    const id = clean(idRaw);
    const concerto = porId.get(id);
    if (!concerto || id.startsWith('hist-') || !estadoRealizado(concerto.estado)) continue;

    const data = dataCanon(concerto.data);
    if (!data || data < inicio || data > fin) continue;

    const asistentes = Array.isArray(asistentesRaw) ? asistentesRaw : [];
    porConcertoPeriodo[id] = asistentes;
    if (!asistentes.length) continue;

    concertosConAsistencia += 1;
    const referencia = {
      id,
      data,
      nome: clean(concerto.nome) || `Concerto ${id}`
    };

    for (const asistente of asistentes) {
      const nome = clean(asistente?.nome);
      const voz = clean(asistente?.voz) || 'Sen voz indicada';
      if (!nome) continue;
      totalAsistencias += 1;
      const key = `${voz}|${nome}`;
      if (!persoas.has(key)) persoas.set(key, { nome, voz, concertos: [] });
      const persoa = persoas.get(key);
      if (!persoa.concertos.some((c) => c.id === referencia.id)) persoa.concertos.push(referencia);
    }
  }

  const lista = [...persoas.values()];
  for (const persoa of lista) {
    persoa.concertos.sort((a, b) => dataCanon(b.data).localeCompare(dataCanon(a.data)) || a.nome.localeCompare(b.nome, 'gl'));
  }

  const totais = [...new Set(lista.map((p) => p.concertos.length))].sort((a, b) => b - a);
  const niveis = totais.map((total) => {
    const grupo = lista.filter((p) => p.concertos.length === total);
    const voces = [...new Set(grupo.map((p) => p.voz))]
      .sort((a, b) => ordeVoz(a) - ordeVoz(b) || a.localeCompare(b, 'gl'))
      .map((voz) => ({
        voz,
        persoas: grupo.filter((p) => p.voz === voz)
          .sort((a, b) => a.nome.localeCompare(b.nome, 'gl', { sensitivity: 'base' }))
      }));
    return { totalConcertos: total, totalPersoas: grupo.length, voces };
  });

  return {
    ok: true,
    version: 2,
    gardadoEn: Date.now(),
    xeradoEn: new Date().toISOString(),
    xeradoPor: user.email,
    periodo: { inicio, fin },
    criterios: {
      estados: ['Realizado'],
      computa: 'Só asistentes con estado Asiste',
      agrupacion: 'Número de concertos, corda e orde alfabética'
    },
    resumo: {
      persoas: lista.length,
      asistencias: totalAsistencias,
      concertos: concertosConAsistencia,
      concertosRealizadosPeriodo
    },
    asistenciasPorConcerto: porConcertoPeriodo,
    informe: { niveis }
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (clean(env.CF_PAGES_BRANCH) === 'main') return json(403, { ok:false, erro:'Este xerador está habilitado só en Preview.' });
  if (!env.R2_PRIVADO || !env.FIREBASE_API_KEY) return json(500, { ok:false, erro:'Preview non está configurado correctamente.' });

  const body = await request.json().catch(() => null);
  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });
  if (!(await verificarAdministracionR2(env, user))) return json(403, { ok:false, erro:'Usuario non autorizado para Administración.' });

  const accion = clean(body?.accion || 'obter');
  if (accion === 'obter') {
    const actual = await lerJson(env.R2_PRIVADO, REPORT_KEY);
    return actual?.ok ? json(200, actual) : json(404, { ok:false, erro:'O informe aínda non foi xerado.' });
  }
  if (accion !== 'xerar') return json(400, { ok:false, erro:'Acción non válida.' });

  const inicio = clean(body?.inicio);
  const fin = clean(body?.fin);
  if (!dataValida(inicio) || !dataValida(fin)) {
    return json(400, { ok:false, erro:'Indica unha data inicial e unha data final válidas.' });
  }
  if (inicio > fin) {
    return json(400, { ok:false, erro:'A data inicial non pode ser posterior á data final.' });
  }

  const [concertos, asistencias] = await Promise.all([
    lerJson(env.R2_PRIVADO, CONCERT_INDEX_KEY),
    lerJson(env.R2_PRIVADO, ATTENDANCE_INDEX_KEY)
  ]);
  if (!concertos?.ok || !Array.isArray(concertos.concertos)) return json(409, { ok:false, erro:'Non está dispoñible o índice de concertos de Preview.' });
  if (!asistencias?.resultado?.asistenciasPorConcerto) return json(409, { ok:false, erro:'Non está dispoñible o índice de asistencias de Preview.' });

  const informe = crearInforme(concertos, asistencias, user, inicio, fin);
  await env.R2_PRIVADO.put(REPORT_KEY, JSON.stringify(informe), {
    httpMetadata: { contentType:'application/json; charset=utf-8', cacheControl:'private, no-store' },
    customMetadata: { tipo:'informe-asistencia-concertos', version:'2' }
  });

  return json(200, informe);
}
