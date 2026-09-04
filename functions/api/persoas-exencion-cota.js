import { obterJsonAppsScriptPersoas } from '../_lib/apps-script-persoas.js';

const LEGAL_ID = 'EXENCION_COTA_SCPP';
const REVIEW_PREFIX = 'persoas/revisions/';
const R2_KEY_MAIN = 'persoas/textos-legais/EXENCION_COTA_SCPP.json';
const R2_KEY_PREVIEW = 'persoas/textos-legais/preview/EXENCION_COTA_SCPP.json';

const clean = (value) => String(value == null ? '' : value).trim();
const branch = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const legalKey = (env) => branch(env) === 'main' ? R2_KEY_MAIN : R2_KEY_PREVIEW;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
});

function tokenValido(value) {
  const token = clean(value);
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : '';
}

function validarTexto(value) {
  const item = value && typeof value === 'object' ? value : null;
  if (!item) return null;
  const texto = {
    id: clean(item.id),
    version: clean(item.version),
    titulo: clean(item.titulo),
    texto: clean(item.texto),
    ambito: clean(item.ambito),
    dataVixencia: clean(item.dataVixencia)
  };
  return texto.id === LEGAL_ID && texto.version && texto.titulo && texto.texto ? texto : null;
}

async function revisionValida(env, token) {
  if (!env.R2_PRIVADO?.get) return false;
  const object = await env.R2_PRIVADO.get(`${REVIEW_PREFIX}${token}.json`);
  if (!object) return false;
  const revision = await object.json().catch(() => null);
  return revision?.token === token
    && revision?.estado === 'PENDENTE'
    && Date.parse(clean(revision?.caducaEn)) > Date.now();
}

async function lerR2(env) {
  if (!env.R2_PRIVADO?.get) return null;
  const object = await env.R2_PRIVADO.get(legalKey(env));
  if (!object) return null;
  const value = await object.json().catch(() => null);
  return validarTexto(value?.texto || value);
}

async function gardarR2(env, texto) {
  if (!env.R2_PRIVADO?.put) return;
  await env.R2_PRIVADO.put(legalKey(env), JSON.stringify({
    gardadoEn: new Date().toISOString(),
    entorno: branch(env),
    texto
  }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
}

async function cargarDesdeSheet(env) {
  if (!env.WEB_WRITE_TOKEN) throw new Error('Apps Script non está configurado.');
  const { resultado } = await obterJsonAppsScriptPersoas(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'persoasV2SyncListar',
    email: '',
    actorEmail: '',
    fonte: 'revision-exencion-cota'
  }, { timeoutMs: 30_000, attemptTimeoutMs: 12_000 });
  if (!resultado?.ok) throw new Error(resultado?.erro || 'Non foi posible ler os textos legais desde a Sheet.');
  const texto = validarTexto(resultado?.textosLegais?.exencionCota);
  if (!texto) throw new Error('O texto de exención da cota non está dispoñible en TextosLegais.');
  await gardarR2(env, texto);
  return texto;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json(405, { ok: false, erro: 'Método non permitido.' });
  const token = tokenValido(new URL(request.url).searchParams.get('token'));
  if (!token) return json(400, { ok: false, erro: 'A ligazón de revisión non é válida.' });
  if (!(await revisionValida(env, token))) {
    return json(404, { ok: false, erro: 'A revisión non existe, caducou ou xa foi completada.' });
  }

  try {
    const cache = await lerR2(env);
    const texto = cache || await cargarDesdeSheet(env);
    return json(200, {
      ok: true,
      textoExencionCota: texto,
      fonte: cache ? 'R2' : 'SHEET+R2',
      entorno: branch(env)
    });
  } catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible cargar o texto de exención da cota.' });
  }
}
