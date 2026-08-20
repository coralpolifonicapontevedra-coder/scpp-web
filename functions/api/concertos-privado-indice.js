const INDEX_KEY = 'indices/concertos-privado-v1.json';
const PREVIEW_INDEX_KEY = 'indices/preview/concertos-privado-v1.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    ...extraHeaders
  }
});

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ idToken:token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid:String(user.localId || ''), email:String(user.email).trim().toLowerCase() };
}

function contexto(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  const preview = host.endsWith('.scpp-web.pages.dev') && host !== 'scpp-web.pages.dev';
  return { preview, key:preview ? PREVIEW_INDEX_KEY : INDEX_KEY };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok:false, erro:'O servizo non está configurado correctamente.' });

  let body;
  try { body = await request.json(); }
  catch { return json(400, { ok:false, erro:'Solicitude non válida.' }); }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok:false, erro:'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });

  const ctx = contexto(request);
  let object = await env.R2_PRIVADO.get(ctx.key);
  let keyUsada = ctx.key;
  if (!object && ctx.preview) {
    object = await env.R2_PRIVADO.get(INDEX_KEY);
    keyUsada = INDEX_KEY;
  }
  if (!object) return json(503, { ok:false, erro:'O índice privado de concertos aínda non está dispoñible.' });

  const index = await object.json().catch(() => null);
  if (index?.ok !== true || Number(index?.version) !== 1 || !Array.isArray(index?.concertos)) {
    return json(503, { ok:false, erro:'O índice privado de concertos non é válido.' });
  }

  return json(200, {
    ...index,
    cache:'R2',
    ambiente:ctx.preview ? 'preview' : 'production'
  }, {
    'X-SCPP-Concertos-Privado':ctx.preview ? 'R2-PREVIEW' : 'R2',
    'X-SCPP-Concertos-Key':keyUsada
  });
}
