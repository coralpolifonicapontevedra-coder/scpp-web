const DRAFT_PREFIX = 'ensaios/borradores-v1/';
const TIMEOUT_FIREBASE_MS = 8_000;

const clean = (value) => String(value || '').trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  }
});

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal:controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken:token}) },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { email:clean(user.email).toLowerCase() };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function draftKey(idEnsaio) {
  return `${DRAFT_PREFIX}${await sha256(idEnsaio)}.json`;
}

export async function onRequest({request, env}) {
  if (request.method !== 'POST') return json(405, {ok:false, erro:'Método non permitido.'});
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO?.get || !env.R2_PRIVADO?.put) return json(500, {ok:false, erro:'O servizo non está configurado.'});

  const body = await request.json().catch(() => null);
  if (!body) return json(400, {ok:false, erro:'Solicitude non válida.'});

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, {ok:false, erro:'Non foi posible validar a sesión.'}); }
  if (!user) return json(401, {ok:false, erro:'A identificación non é válida ou caducou.'});

  const idEnsaio = clean(body.idEnsaio);
  const idPersoa = clean(body.idPersoa);
  if (!idEnsaio || !idPersoa) return json(400, {ok:false, erro:'Falta identificar o ensaio ou a persoa.'});

  const key = await draftKey(idEnsaio);
  const object = await env.R2_PRIVADO.get(key);
  if (!object) return json(404, {ok:false, erro:'Non hai borrador R2 deste ensaio.'});
  const draft = await object.json().catch(() => null);
  if (!draft || draft.version !== 1 || draft.idEnsaio !== idEnsaio || !Array.isArray(draft.asistencias)) {
    return json(409, {ok:false, erro:'O borrador R2 non é válido.'});
  }

  const asistencias = draft.asistencias.filter((row) => clean(row?.persoa || row?.idPersoa) !== idPersoa);
  const updated = { ...draft, asistencias, updatedAt:new Date().toISOString() };
  await env.R2_PRIVADO.put(key, JSON.stringify(updated), {
    httpMetadata:{contentType:'application/json; charset=utf-8', cacheControl:'private, no-store'}
  });

  return json(200, {ok:true, draft:updated, almacen:'R2'});
}
