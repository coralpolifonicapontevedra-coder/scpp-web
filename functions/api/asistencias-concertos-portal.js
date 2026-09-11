import { onRequest as obterAsistenciasBase } from './asistencias-concertos.js';

const clean = (value = '') => String(value || '').trim();
const rama = (env = {}) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const draftKey = (env, id) => `concertos/borradores-v1/${rama(env)}/${encodeURIComponent(clean(id))}.json`;
const snapshotPersoasKey = (env) => rama(env) === 'main'
  ? 'persoas/cache/snapshot-v4.json'
  : 'persoas/cache/preview/snapshot-v4.json';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...headers
  }
});

async function lerJson(bucket, key) {
  if (!bucket?.get) return null;
  try {
    const obxecto = await bucket.get(key);
    return obxecto ? await obxecto.json() : null;
  } catch {
    return null;
  }
}

function normalizar(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function eCantor(persoa) {
  const tipo = normalizar(persoa?.tipoSocio || persoa?.['Tipo de socio'] || persoa?.tipo);
  return tipo === 'cantor/a' || tipo === 'cantor' || tipo === 'cantora';
}

async function idsCantores(env) {
  const snapshot = await lerJson(env.R2_PRIVADO, snapshotPersoasKey(env));
  const persoas = Array.isArray(snapshot?.payload?.persoas)
    ? snapshot.payload.persoas
    : Array.isArray(snapshot?.persoas) ? snapshot.persoas : [];

  return new Set(
    persoas
      .filter(eCantor)
      .flatMap((persoa) => [persoa?.idPersoa, persoa?.id, persoa?.rowId])
      .map(clean)
      .filter(Boolean)
  );
}

function asistentesDesdeBorrador(draft, cantores) {
  if (!draft || !Array.isArray(draft.persoas)) return null;

  const limitarACantores = cantores instanceof Set && cantores.size > 0;
  const asistentes = draft.persoas
    .filter((persoa) => clean(persoa?.estado).toLowerCase() === 'asiste')
    .filter((persoa) => !limitarACantores || cantores.has(clean(persoa?.id || persoa?.idPersoa)))
    .map((persoa) => ({
      nome: `${[clean(persoa?.primeiroApelido), clean(persoa?.segundoApelido)].filter(Boolean).join(' ')}, ${clean(persoa?.nome)}`.replace(/^,\s*/, ''),
      voz: clean(persoa?.voz) || 'Sen voz indicada'
    }))
    .filter((persoa) => persoa.nome);

  return asistentes;
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido.' });
  }

  // Conservamos autenticación, permisos e compatibilidade histórica do endpoint existente.
  const respostaBase = await obterAsistenciasBase({
    ...context,
    request: context.request.clone()
  });

  const datos = await respostaBase.clone().json().catch(() => null);
  if (!respostaBase.ok || !datos?.ok || !datos?.asistenciasPorConcerto) {
    return respostaBase;
  }

  const porConcerto = { ...datos.asistenciasPorConcerto };
  const ids = Object.keys(porConcerto);
  const cantores = await idsCantores(context.env).catch(() => new Set());
  let corrixidos = 0;

  // Para concertos xestionados desde Administración, o borrador R2 conserva o estado
  // exacto marcado. Ademais, só se consideran asistentes as persoas coa condición
  // de Cantor/a en Persoas: dirección, colaboradores e outros tipos quedan fóra.
  await Promise.all(ids.map(async (id) => {
    const draft = await lerJson(context.env.R2_PRIVADO, draftKey(context.env, id));
    const asistentes = asistentesDesdeBorrador(draft, cantores);
    if (!asistentes) return;
    porConcerto[id] = asistentes;
    corrixidos += 1;
  }));

  const headers = {};
  for (const [clave, valor] of respostaBase.headers.entries()) {
    if (!['content-length', 'content-encoding'].includes(clave.toLowerCase())) headers[clave] = valor;
  }
  headers['X-SCPP-Asistencias-Portal'] = 'borrador-r2-cantores';
  headers['X-SCPP-Asistencias-Corrixidas'] = String(corrixidos);
  headers['X-SCPP-Cantores-Catalogo'] = String(cantores.size);

  return json(200, {
    ...datos,
    asistenciasPorConcerto: porConcerto
  }, headers);
}
