const INDEX_KEY = 'indices/concertos-privado-v1.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

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
  const obxecto = await env.R2_PRIVADO.get(INDEX_KEY);
  if (!obxecto) return json(503, { ok: false, erro: 'O índice de concertos aínda non está dispoñible.' });
  const indice = await obxecto.json().catch(() => null);
  if (indice?.ok !== true || !Array.isArray(indice?.concertos)) {
    return json(503, { ok: false, erro: 'O índice de concertos non é válido.' });
  }
  const duracion = Date.now() - inicio;
  return json(200, { ...indice, cache: 'R2', tempoRespostaMs: duracion }, {
    'X-SCPP-Concertos-Index': 'R2-PRIVADO',
    'Server-Timing': `r2;dur=${duracion}`
  });
}
