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

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (clean(env.CF_PAGES_BRANCH) === 'main') return json(404, { ok:false, erro:'Informe materializado aínda non habilitado en produción.' });
  if (!env.R2_PRIVADO || !env.FIREBASE_API_KEY) return json(500, { ok:false, erro:'O servizo non está configurado.' });

  const body = await request.json().catch(() => null);
  const user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });

  const object = await env.R2_PRIVADO.get(REPORT_KEY);
  if (!object) return json(404, { ok:false, erro:'O informe de asistencia aínda non foi xerado desde Administración.' });
  const informe = await object.json().catch(() => null);
  if (!informe?.ok || !informe?.informe?.niveis) return json(502, { ok:false, erro:'O informe gardado non ten un formato válido.' });

  return json(200, informe);
}
