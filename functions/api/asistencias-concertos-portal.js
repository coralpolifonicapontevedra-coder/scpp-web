import { onRequest as obterAsistenciasBase } from './asistencias-concertos.js';

const clean = (value = '') => String(value || '').trim();
const rama = (env = {}) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const draftKey = (env, id) => `concertos/borradores-v1/${rama(env)}/${encodeURIComponent(clean(id))}.json`;

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

function asistentesDesdeBorrador(draft) {
  if (!draft || !Array.isArray(draft.persoas)) return null;

  const asistentes = draft.persoas
    .filter((persoa) => clean(persoa?.estado).toLowerCase() === 'asiste')
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
  let corrixidos = 0;

  // Para concertos xestionados desde Administración, o borrador R2 conserva o estado
  // exacto marcado (Asiste / Non asiste / Xustificada). É a fonte autoritativa para o
  // Portal e evita que un lector antigo de Apps Script interprete todas as filas como asistentes.
  await Promise.all(ids.map(async (id) => {
    const draft = await lerJson(context.env.R2_PRIVADO, draftKey(context.env, id));
    const asistentes = asistentesDesdeBorrador(draft);
    if (!asistentes) return;
    porConcerto[id] = asistentes;
    corrixidos += 1;
  }));

  const headers = {};
  for (const [clave, valor] of respostaBase.headers.entries()) {
    if (!['content-length', 'content-encoding'].includes(clave.toLowerCase())) headers[clave] = valor;
  }
  headers['X-SCPP-Asistencias-Portal'] = 'borrador-r2-autoritativo';
  headers['X-SCPP-Asistencias-Corrixidas'] = String(corrixidos);

  return json(200, {
    ...datos,
    asistenciasPorConcerto: porConcerto
  }, headers);
}
