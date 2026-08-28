import { obterJsonAppsScript } from '../_lib/apps-script.js';

const CACHE_PERMISOS_MS = 5 * 60 * 1000;
const cachePermisos = new Map();

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

function limparCache() {
  const agora = Date.now();
  for (const [email, entrada] of cachePermisos.entries()) {
    if (!entrada || entrada.expira <= agora) cachePermisos.delete(email);
  }
  while (cachePermisos.size > 100) cachePermisos.delete(cachePermisos.keys().next().value);
}

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
  return { uid: String(user.localId || ''), email: String(user.email).trim().toLowerCase() };
}

async function comprobarAdministracion(env, user) {
  const cacheada = cachePermisos.get(user.email);
  if (cacheada?.expira > Date.now() && typeof cacheada.administracion === 'boolean') return cacheada.administracion;

  let administracion = false;
  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'listarPersoasAdministracion',
      email: user.email,
      uidFirebase: user.uid
    }, { timeoutMs: 15_000, attemptTimeoutMs: 8_000 });
    administracion = resultado?.ok === true && resultado?.perfil?.nivel === 'Administración';
  } catch (error) {
    console.error('Erro ao comprobar permisos de Administración:', error);
  }

  cachePermisos.set(user.email, { ...(cacheada || {}), administracion, expira: Date.now() + CACHE_PERMISOS_MS });
  limparCache();
  return administracion;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return context.next();

  const pathname = new URL(request.url).pathname.replace(/\/$/, '') || '/';

  // Ensaios xa valida identidade e permisos no propio endpoint e, para as
  // escrituras, en Apps Script mediante resolverPermisosPortal_. Evitamos unha
  // segunda capa de autorización con criterios distintos, que podía provocar 403
  // falsos aínda que o usuario tivese permisos reais no Portal.
  if (pathname !== '/api/partituras') return context.next();

  let body;
  try { body = await request.clone().json(); }
  catch { return context.next(); }

  const accion = String(body?.accion || '').trim();
  const precisaAdministracion = accion === 'altaPartituraPortal' || accion === 'eliminarPartituraPortal';
  if (!precisaAdministracion) return context.next();

  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'O servizo de permisos non está configurado correctamente.' });
  }

  let user;
  try { user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY); }
  catch (error) {
    console.error('Erro ao validar Firebase no control de permisos:', error);
    return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
  }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  const permitido = await comprobarAdministracion(env, user);
  if (!permitido) {
    return json(403, {
      ok: false,
      codigo: 'ADMIN_REQUIRED',
      erro: 'Só a administración pode dar de alta ou eliminar partituras.'
    });
  }

  return context.next();
}
