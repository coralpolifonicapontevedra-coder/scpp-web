import { obterJsonAppsScript } from '../_lib/apps-script.js';

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
  if (!token || !apiKey) return null;

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

async function eAdministrador(env, user) {
  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'listarPersoasAdministracion',
      email: user.email,
      uidFirebase: user.uid
    }, { timeoutMs: 15000, attemptTimeoutMs: 8000 });

    // listarPersoasAdministracion xa resolve a autorización no Apps Script
    // mediante resolverPermisosPortal_ e só devolve perfil cando a persoa
    // dispón de escritura administrativa. Non volvemos interpretar o texto
    // de "nivel" aquí para evitar 403 falsos por diferenzas de formato.
    return resultado?.ok === true && Boolean(resultado?.perfil?.email);
  } catch (error) {
    console.error('Erro ao comprobar administración en permisos:', error);
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'O servizo de permisos non está configurado.' });
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

  const accion = String(body?.accion || '').trim();
  const permitidas = new Set([
    'listarPermisosPortal',
    'gardarPermisoPortal',
    'eliminarPermisoPortal',
    'listarActividadePortal',
    'rexistrarActividadePortal',
    'obterPermisosUsuarioPortal'
  ]);

  if (!permitidas.has(accion)) {
    return json(400, { ok: false, erro: 'Acción de permisos descoñecida.' });
  }

  const admin = await eAdministrador(env, user);
  const requireAdmin = [
    'listarPermisosPortal',
    'gardarPermisoPortal',
    'eliminarPermisoPortal',
    'listarActividadePortal'
  ].includes(accion);

  if (requireAdmin && !admin) {
    return json(403, {
      ok: false,
      codigo: 'ADMIN_REQUIRED',
      erro: 'A túa conta non ten permisos de administración para esta operación.'
    });
  }

  const payload = {
    ...body,
    token: env.WEB_WRITE_TOKEN,
    email: user.email,
    uidFirebase: user.uid,
    actorEmail: user.email
  };
  delete payload.idToken;

  try {
    const { resultado } = await obterJsonAppsScript(env, payload, {
      timeoutMs: 20000,
      attemptTimeoutMs: 9000
    });

    if (!resultado?.ok) {
      return json(400, resultado || { ok: false, erro: 'Non foi posible completar a operación.' });
    }

    return json(200, { ...resultado, administrador: admin });
  } catch (error) {
    console.error('Erro na API de permisos:', error);
    return json(502, { ok: false, erro: 'Non foi posible contactar co servizo de permisos.' });
  }
}
