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

function eOperacionTPV(item) {
  const formaPago = clean(item?.formaPago).toLowerCase();
  return formaPago === 'tpv ceca' || Boolean(clean(item?.numOperacionTPV)) || Boolean(clean(item?.referenciaTPV));
}

async function verificarFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    }
  );

  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;

  return {
    uid: clean(user.localId),
    email: clean(user.email).toLowerCase()
  };
}

export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'POST') {
      return json(405, { ok: false, erro: 'Método non permitido.' });
    }

    if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
      return json(500, { ok: false, erro: 'O servizo de doazóns non está configurado.' });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { ok: false, erro: 'Solicitude non válida.' });
    }

    let user;
    try {
      user = await verificarFirebase(body?.idToken, env.FIREBASE_API_KEY);
    } catch {
      return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
    }

    if (!user) {
      return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });
    }

    const accion = clean(body?.accion);
    const permitidas = new Set([
      'listarDoazonsAdministracion',
      'actualizarEstadoDoazonAdministracion'
    ]);

    if (!permitidas.has(accion)) {
      return json(400, { ok: false, erro: 'Acción non permitida.' });
    }

    const payload = {
      ...body,
      token: env.WEB_WRITE_TOKEN,
      email: user.email,
      actorEmail: user.email,
      uidFirebase: user.uid,
      accion
    };
    delete payload.idToken;

    try {
      const { resultado } = await obterJsonAppsScript(env, payload, {
        timeoutMs: 20000,
        attemptTimeoutMs: 9000
      });

      if (!resultado?.ok) {
        const status = resultado?.codigo === 'ADMIN_REQUIRED' ? 403 : 400;
        return json(status, resultado || { ok: false, erro: 'Non foi posible completar a operación.' });
      }

      if (accion === 'listarDoazonsAdministracion') {
        return json(200, {
          ...resultado,
          doazons: (Array.isArray(resultado.doazons) ? resultado.doazons : []).filter(eOperacionTPV)
        });
      }

      return json(200, resultado);
    } catch (error) {
      console.error('Erro na API de doazóns:', error);
      return json(502, {
        ok: false,
        erro: 'Non foi posible contactar co servizo de doazóns.'
      });
    }
  } catch (error) {
    console.error('Erro inesperado na API de doazóns:', error);
    return json(500, {
      ok: false,
      erro: 'Produciuse un erro interno no servizo de doazóns.'
    });
  }
}
