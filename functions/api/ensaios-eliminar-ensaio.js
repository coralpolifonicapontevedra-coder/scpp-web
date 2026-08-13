const TIMEOUT_FIREBASE_MS = 8_000;
const TIMEOUT_APPS_SCRIPT_MS = 20_000;
const MAIN_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';
const DRAFT_PREFIX = 'ensaios/borradores-v1/';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  }
});

const clean = (value) => String(value || '').trim();

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, redirect:'follow', signal:controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ idToken:token })
    },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid:String(user.localId || ''), email:String(user.email).trim().toLowerCase() };
}

function appsScriptUrl(env) {
  const url = clean(env.APPS_SCRIPT_WEBAPP_URL);
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) ? url : '';
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok:false, erro:'O servizo non está configurado correctamente.' });

  let body;
  try { body = await request.json(); }
  catch { return json(400, { ok:false, erro:'Solicitude non válida.' }); }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch { return json(503, { ok:false, erro:'Non foi posible validar a sesión.' }); }
  if (!user) return json(401, { ok:false, erro:'A identificación non é válida ou caducou.' });

  const idEnsaio = clean(body.idEnsaio);
  if (!idEnsaio) return json(400, { ok:false, erro:'Falta identificar o ensaio.' });

  const url = appsScriptUrl(env);
  if (!url) return json(500, { ok:false, erro:'Non está configurada a implementación principal de Apps Script.' });

  try {
    const response = await fetchConLimite(url, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify({
        token:env.WEB_WRITE_TOKEN,
        accion:'eliminarEnsaioPortal',
        email:user.email,
        uidFirebase:user.uid,
        idEnsaio
      })
    }, TIMEOUT_APPS_SCRIPT_MS);

    const text = await response.text();
    let result;
    try { result = JSON.parse(text); }
    catch { return json(502, { ok:false, erro:'Apps Script devolveu unha resposta non válida.' }); }

    if (!response.ok || !result?.ok) {
      return json(response.status === 403 || result?.codigo === 'FORBIDDEN' ? 403 : 400, {
        ok:false,
        erro:result?.erro || 'Non foi posible eliminar o ensaio.'
      });
    }

    if (env.R2_PRIVADO) {
      const cacheKey = `${MAIN_CACHE_PREFIX}${await sha256(user.email)}.json`;
      const draftKey = `${DRAFT_PREFIX}${await sha256(idEnsaio)}.json`;
      await Promise.all([
        env.R2_PRIVADO.delete(cacheKey).catch(() => {}),
        env.R2_PRIVADO.delete(draftKey).catch(() => {})
      ]);
    }

    return json(200, { ok:true, resultado:result.resultado || result });
  } catch (error) {
    console.error('Erro eliminando ensaio:', error);
    return json(503, { ok:false, erro:'Non foi posible eliminar o ensaio neste momento.' });
  }
}
