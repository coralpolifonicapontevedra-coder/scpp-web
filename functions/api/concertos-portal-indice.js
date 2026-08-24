const INDEX_KEY_MAIN = 'indices/concertos-privado-v1.json';
const INDEX_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

const clean = (value = '') => String(value || '').trim();
const normalizarEstado = (value = '') => clean(value).toLowerCase();
const rama = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const indiceKey = (env) => rama(env) === 'main' ? INDEX_KEY_MAIN : INDEX_KEY_PREVIEW;

function prepararConcertosPortal(concertos = []) {
  const estadosVisibles = new Set(['previsto', 'confirmado', 'realizado']);

  return concertos
    .filter((concerto) => clean(concerto?.id))
    .map((concerto) => {
      const id = clean(concerto.id);
      // Os concertos actuais poden ter NumeroConcerto/OrdeHistorica e deben seguir
      // aparecendo no portal. Só os rexistros importados do histórico usan id hist-*.
      const historico = id.startsWith('hist-');
      const visibleNoPortal = !historico && estadosVisibles.has(normalizarEstado(concerto.estado));

      return {
        ...concerto,
        mostrarWeb: visibleNoPortal
      };
    });
}

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    }
  );
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  return usuario?.email && usuario.emailVerified === true ? usuario : null;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  const body = await request.json().catch(() => null);
  const usuario = await verificarTokenFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  if (!env.R2_PRIVADO) return json(500, { ok: false, erro: 'O índice privado non está configurado.' });

  const inicio = Date.now();
  const key = indiceKey(env);
  const obxecto = await env.R2_PRIVADO.get(key);
  if (!obxecto) {
    return json(503, {
      ok: false,
      erro: `O índice de concertos de ${rama(env)} aínda non está dispoñible.`
    });
  }

  const indice = await obxecto.json().catch(() => null);
  if (indice?.ok !== true || !Array.isArray(indice?.concertos)) {
    return json(503, { ok: false, erro: 'O índice de concertos non é válido.' });
  }

  const concertos = prepararConcertosPortal(indice.concertos);
  const duracion = Date.now() - inicio;

  return json(200, {
    ...indice,
    concertos,
    cache: 'R2',
    rama: rama(env),
    regraPortal: 'Previsto+Confirmado+Realizado; Aprazado/Cancelado só Administración; só id hist-* vai ao Histórico',
    tempoRespostaMs: duracion
  }, {
    'X-SCPP-Concertos-Index': rama(env) === 'main' ? 'R2-PRIVADO-MAIN' : 'R2-PRIVADO-PREVIEW',
    'X-SCPP-Concertos-Portal-Rule': 'previsto-confirmado-realizado',
    'Server-Timing': `r2;dur=${duracion}`
  });
}
