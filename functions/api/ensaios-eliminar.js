const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return {
    uid: String(user.localId || ''),
    email: String(user.email).trim().toLowerCase()
  };
}

function appsScriptUrl(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) ? url : '';
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

  const idEnsaio = String(body.idEnsaio || '').trim();
  const idRepertorio = String(body.idRepertorio || '').trim();
  if (!idEnsaio || !idRepertorio) return json(400, { ok:false, erro:'Falta o ensaio ou a obra.' });

  const url = appsScriptUrl(env);
  if (!url) return json(500, { ok:false, erro:'Non está configurada a implementación principal de Apps Script.' });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: env.WEB_WRITE_TOKEN,
        accion: 'eliminarEnsaioRepertorioPortal',
        email: user.email,
        uidFirebase: user.uid,
        idEnsaio,
        idRepertorio
      })
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); }
    catch { return json(502, { ok:false, erro:'Apps Script devolveu unha resposta non válida.' }); }
    if (!response.ok || !result?.ok) return json(response.status === 403 ? 403 : 400, { ok:false, erro:result?.erro || 'Non foi posible eliminar a obra.' });
    return json(200, { ok:true, resultado:result.resultado || result });
  } catch (error) {
    console.error('Erro eliminando obra do ensaio:', error);
    return json(503, { ok:false, erro:'Non foi posible eliminar a obra neste momento.' });
  }
}
