import { obterJsonAppsScript } from '../_lib/apps-script.js';

const APPS_SCRIPT_PRODUCION = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const APPS_SCRIPT_PREVIEW = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';

const CATALOGO_KEY_MAIN = 'repertorio/cache/catalogo.json';
const CATALOGO_KEY_PREVIEW = 'repertorio/cache/preview/catalogo.json';
const ADMIN_KEY_MAIN = 'repertorio/cache/administracion/main/listado-v2.json';
const ADMIN_KEY_PREVIEW = 'repertorio/cache/administracion/preview/listado-v2.json';
const CONCERTOS_KEY_MAIN = 'indices/concertos-privado-v1.json';
const CONCERTOS_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const CACHE_FRESH_MS = 60 * 1000;
const FIREBASE_TIMEOUT_MS = 8_000;

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

const clean = (value = '') => String(value ?? '').trim();
const truth = (value) => value === true || ['Y', 'SI', 'SÍ', 'TRUE', '1', 'YES'].includes(clean(value).toUpperCase());

function ramaActual(env) {
  return clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
}

function catalogoKey(env) {
  return ramaActual(env) === 'main' ? CATALOGO_KEY_MAIN : CATALOGO_KEY_PREVIEW;
}

function adminKey(env) {
  return ramaActual(env) === 'main' ? ADMIN_KEY_MAIN : ADMIN_KEY_PREVIEW;
}

function concertosKey(env) {
  return ramaActual(env) === 'main' ? CONCERTOS_KEY_MAIN : CONCERTOS_KEY_PREVIEW;
}

function appsScriptUrl(env) {
  return ramaActual(env) === 'main' ? APPS_SCRIPT_PRODUCION : APPS_SCRIPT_PREVIEW;
}

function canonId(value) {
  const raw = clean(value);
  if (!raw) return '';
  const num = Number(raw.replace(',', '.'));
  return Number.isFinite(num) ? String(Math.trunc(num)) : raw;
}

function basename(value) {
  return clean(value).replace(/\\/g, '/').split('/').pop() || '';
}

function slugFilename(filename) {
  const name = basename(filename);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
  const slug = stem
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}${ext}`;
}

async function fetchConTempoLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const response = await fetchConTempoLimite(
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

async function readJson(bucket, key) {
  if (!bucket?.get) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json().catch(() => null);
}

async function writeJson(bucket, key, value) {
  if (!bucket?.put) return;
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
}

function catalogoFresh(catalogo) {
  const savedAt = Number(catalogo?.cacheMeta?.savedAt || 0);
  return catalogo?.ok === true && Array.isArray(catalogo?.obras) && savedAt > 0 && Date.now() - savedAt <= CACHE_FRESH_MS;
}

async function refrescarDesdeSheets(env, user) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'listarRepertorioAdministracion',
    email: user.email,
    uidFirebase: user.uid
  }, {
    timeoutMs: 30000,
    attemptTimeoutMs: 12000,
    urlOverride: appsScriptUrl(env)
  });

  if (!resultado?.ok || !Array.isArray(resultado.obras) || !Array.isArray(resultado.partituras) || !Array.isArray(resultado.audios)) {
    throw new Error(resultado?.erro || 'A lectura actual das follas de Repertorio non é válida.');
  }

  const savedAt = Date.now();
  await writeJson(env.R2_PRIVADO, adminKey(env), {
    gardadoEn: savedAt,
    payload: resultado
  });
  return { payload: resultado, savedAt };
}

function idPrograma(item = {}) {
  return canonId(
    item.idRepertorio ??
    item.obraId ??
    item.Id_Obras ??
    item.Id_Obra ??
    item.Id_Repertorio ??
    item.IdRepertorio ??
    item.id_repertorio ??
    item.repertorioId ??
    item.id
  );
}

function concertosPorObra(indice) {
  const map = new Map();
  for (const concerto of Array.isArray(indice?.concertos) ? indice.concertos : []) {
    for (const item of Array.isArray(concerto?.programa) ? concerto.programa : []) {
      const workId = idPrograma(item);
      if (!workId) continue;
      if (!map.has(workId)) map.set(workId, []);
      map.get(workId).push({
        id: clean(concerto.id),
        data: clean(concerto.data),
        nome: clean(concerto.nome) || 'Concerto',
        cidade: clean(concerto.cidade),
        lugar: clean(concerto.lugar),
        orde: item.orde ?? item.Orde ?? '',
        solista: clean(item.solista ?? item.Solista)
      });
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => clean(b.data).localeCompare(clean(a.data)));
  }
  return map;
}

function fallbackConcertosPorObra(catalogoAnterior) {
  const map = new Map();
  for (const obra of Array.isArray(catalogoAnterior?.obras) ? catalogoAnterior.obras : []) {
    const id = canonId(obra?.id ?? obra?.Id);
    if (id && Array.isArray(obra?.concertos)) map.set(id, obra.concertos);
  }
  return map;
}

function mapPartitura(row) {
  const sourceName = basename(row.PDF);
  const key = clean(row.R2Key).replace(/^\/+/, '') || (sourceName ? `partituras/${sourceName}` : '');
  if (!key) return null;
  return {
    id: canonId(row.Id_Partitura),
    nome: clean(row.Nomepartitura) || sourceName || 'Partitura',
    voz: clean(row.Voz) || 'General',
    tipo: clean(row.TipoPartitura),
    principal: truth(row.Principal),
    ruta: key,
    r2Key: key,
    mimeType: clean(row.MimeType) || 'application/pdf',
    tamano: Number(row.TamanoR2 || 0) || 0,
    orixe: 'r2'
  };
}

function mapAudio(row) {
  const rawWorkId = clean(row.NomeObra);
  const sourceName = basename(row.AudioFile);
  let key = clean(row.R2Key).replace(/^\/+/, '');
  if (!key && rawWorkId && sourceName) key = `repertorio/audios/${rawWorkId}/${slugFilename(sourceName)}`;
  if (!key) return null;
  return {
    id: canonId(row.Id_Audio),
    nome: sourceName || clean(row.NomeAudio) || 'Audio',
    voz: clean(row.Voz) || 'Audio',
    tipo: clean(row.TipoAudio),
    orde: Number(row.Orde || 999) || 999,
    grupo: clean(row['Observacións']),
    ruta: key,
    r2Key: key,
    mimeType: clean(row.MimeType),
    tamano: Number(row.TamanoR2 || 0) || 0,
    orixe: 'r2'
  };
}

function construirCatalogo(snapshot, concertIndex, catalogoAnterior) {
  const obras = Array.isArray(snapshot?.obras) ? snapshot.obras : [];
  const partituras = Array.isArray(snapshot?.partituras) ? snapshot.partituras : [];
  const audios = Array.isArray(snapshot?.audios) ? snapshot.audios : [];

  const scoresByWork = new Map();
  for (const row of partituras) {
    if (!truth(row.Activa)) continue;
    const workId = canonId(row.Id_Repertorio);
    const score = mapPartitura(row);
    if (!workId || !score) continue;
    if (!scoresByWork.has(workId)) scoresByWork.set(workId, []);
    scoresByWork.get(workId).push(score);
  }
  for (const list of scoresByWork.values()) {
    list.sort((a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome, 'gl', { sensitivity: 'base' }));
  }

  const audiosByWork = new Map();
  for (const row of audios) {
    if (!truth(row.Activo)) continue;
    const workId = canonId(row.NomeObra);
    const audio = mapAudio(row);
    if (!workId || !audio) continue;
    if (!audiosByWork.has(workId)) audiosByWork.set(workId, []);
    audiosByWork.get(workId).push(audio);
  }
  for (const list of audiosByWork.values()) {
    list.sort((a, b) => a.orde - b.orde || a.voz.localeCompare(b.voz, 'gl', { sensitivity: 'base' }));
  }

  const concerts = Array.isArray(concertIndex?.concertos) && concertIndex.concertos.length
    ? concertosPorObra(concertIndex)
    : fallbackConcertosPorObra(catalogoAnterior);

  const mapped = obras
    .map((row) => {
      const id = canonId(row.Id);
      if (!id || !clean(row.NomeObra)) return null;
      const workScores = scoresByWork.get(id) || [];
      const workAudios = audiosByWork.get(id) || [];
      return {
        id,
        nomeObra: clean(row.NomeObra),
        autorLetra: clean(row.AutorLetra),
        compositor: clean(row.Compositor),
        datas: clean(row['Nac/fall']),
        comentarios: clean(row.Comentarios),
        categoria: clean(row.Categoria),
        coleccion: clean(row.Coleccion),
        estadoObra: clean(row.EstadoObra),
        partituras: workScores,
        audios: workAudios,
        concertos: concerts.get(id) || [],
        partiturasR2: workScores,
        audiosR2: workAudios,
        tenRecursosR2: workScores.length > 0 || workAudios.length > 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.nomeObra.localeCompare(b.nomeObra, 'gl', { sensitivity: 'base' }));

  return {
    ok: true,
    obras: mapped,
    indiceR2: {
      obras: mapped.filter((obra) => obra.tenRecursosR2).length,
      audios: mapped.reduce((sum, obra) => sum + obra.audios.length, 0),
      partituras: mapped.reduce((sum, obra) => sum + obra.partituras.length, 0),
      completo: true
    }
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo de Repertorio non está configurado correctamente.' });
  }

  const body = await request.json().catch(() => null);
  if (!body || clean(body.accion || 'listarRepertorioPortal') !== 'listarRepertorioPortal') {
    return json(400, { ok: false, erro: 'Acción non permitida nesta ruta.' });
  }

  const user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  const key = catalogoKey(env);
  const inicio = Date.now();
  const catalogoAnterior = await readJson(env.R2_PRIVADO, key);
  if (catalogoFresh(catalogoAnterior)) {
    return json(200, catalogoAnterior, {
      'X-SCPP-Repertorio': 'R2-CACHE',
      'X-SCPP-Repertorio-Source': 'SHEETS-SNAPSHOT',
      'Server-Timing': `r2;dur=${Date.now() - inicio}`
    });
  }

  try {
    const [{ payload, savedAt }, concertIndex] = await Promise.all([
      refrescarDesdeSheets(env, user),
      readJson(env.R2_PRIVADO, concertosKey(env))
    ]);
    const catalogo = construirCatalogo(payload, concertIndex, catalogoAnterior);
    catalogo.cacheMeta = {
      savedAt,
      source: 'Sheets→R2',
      branch: ramaActual(env),
      version: 'repertorio-cache-v2'
    };
    await writeJson(env.R2_PRIVADO, key, catalogo);

    return json(200, catalogo, {
      'X-SCPP-Repertorio': 'R2-REFRESH',
      'X-SCPP-Repertorio-Source': 'SHEETS-SNAPSHOT',
      'Server-Timing': `sync;dur=${Date.now() - inicio}`
    });
  } catch (error) {
    console.error('Non se puido sincronizar Repertorio Sheet → R2:', error);
    if (catalogoAnterior?.ok === true && Array.isArray(catalogoAnterior?.obras)) {
      return json(200, catalogoAnterior, {
        'X-SCPP-Repertorio': 'R2-STALE',
        'X-SCPP-Repertorio-Warning': 'SYNC-FAILED',
        'Server-Timing': `stale;dur=${Date.now() - inicio}`
      });
    }
    return json(503, {
      ok: false,
      erro: 'Non foi posible sincronizar a caché de Repertorio neste momento.'
    });
  }
}
