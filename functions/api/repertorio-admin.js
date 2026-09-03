import { obterJsonAppsScript } from '../_lib/apps-script.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const clean = (value) => String(value || '').trim();

async function verificarFirebase(token, apiKey) {
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  return user?.email && user.emailVerified
    ? { uid: clean(user.localId), email: clean(user.email).toLowerCase() }
    : null;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function eAdministrador(env, user) {
  const object = await env.R2_PRIVADO?.get?.(`persoas/cache/administracion/${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const data = await object.json().catch(() => null);
  return data?.administrador === user.email && data?.payload?.perfil?.nivel === 'Administración';
}

const ACCIONS = new Set([
  'listarRepertorioAdministracion',
  'altaObraRepertorioAdministracion',
  'altaAudioRepertorioAdministracion',
  'estadoRecursoRepertorioAdministracion',
  'actualizarObraRepertorioAdministracion',
  'actualizarPartituraRepertorioAdministracion',
  'actualizarAudioRepertorioAdministracion'
]);

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, erro: 'Solicitude non válida.' }); }

  const user = await verificarFirebase(clean(body.idToken), env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida.' });
  if (!(await eAdministrador(env, user))) return json(403, { ok: false, erro: 'Só Administración pode xestionar o repertorio.' });

  const accion = clean(body.accion);
  if (!ACCIONS.has(accion)) return json(400, { ok: false, erro: 'Acción non permitida.' });

  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      email: user.email,
      uidFirebase: user.uid,
      accion,
      ...body
    }, { timeoutMs: 30000, attemptTimeoutMs: 12000 });
    return json(resultado?.ok ? 200 : 502, resultado || { ok: false, erro: 'Resposta baleira.' });
  } catch (error) {
    return json(502, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible acceder á administración do repertorio.' });
  }
}
