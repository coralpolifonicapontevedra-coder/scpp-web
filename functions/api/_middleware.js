import { obterJsonAppsScript } from '../_lib/apps-script.js';
import { obterPermisoPortal, obterPermisoPortalCacheado } from '../_lib/portal-permissions.js';

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
  return {
    uid: String(user.localId || ''),
    email: String(user.email).trim().toLowerCase()
  };
}

async function comprobarAdministracion(env, user) {
  const cacheada = cachePermisos.get(user.email);
  if (cacheada?.expira > Date.now() && typeof cacheada.administracion === 'boolean') {
    return cacheada.administracion;
  }

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

  cachePermisos.set(user.email, {
    ...(cacheada || {}),
    administracion,
    expira: Date.now() + CACHE_PERMISOS_MS
  });
  limparCache();
  return administracion;
}

async function comprobarPermisoEnsaiosAdministracion(env, user) {
  try {
    let permiso = await obterPermisoPortalCacheado(env, user, 'ensaios');
    if (!permiso) permiso = await obterPermisoPortal(env, user, 'ensaios');
    return permiso?.podeAdministrar === true;
  } catch (error) {
    console.error('Erro ao comprobar o permiso central de Ensaios:', error);
    return false;
  }
}

async function comprobarXunta(env, user) {
  const cacheada = cachePermisos.get(user.email);
  if (cacheada?.expira > Date.now() && typeof cacheada.xunta === 'boolean') {
    return cacheada.xunta;
  }

  let xunta = false;
  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'listarEnsaiosPortal',
      email: user.email,
      uidFirebase: user.uid
    }, { timeoutMs: 20_000, attemptTimeoutMs: 8_000 });
    xunta = resultado?.ok === true && resultado?.perfil?.podeEditar === true;
  } catch (error) {
    console.error('Erro ao comprobar permisos da Xunta Directiva:', error);
  }

  cachePermisos.set(user.email, {
    ...(cacheada || {}),
    xunta,
    expira: Date.now() + CACHE_PERMISOS_MS
  });
  limparCache();
  return xunta;
}

function requireAdministracion(pathname, accion) {
  if (pathname === '/api/partituras') {
    return accion === 'altaPartituraPortal' || accion === 'eliminarPartituraPortal';
  }

  if (pathname === '/api/ensaios') {
    return accion === 'gardarEnsaio'
      || accion === 'gardarEnsaioRepertorio'
      || accion === 'incluírProgramaEnsaio';
  }

  if (pathname === '/api/ensaios-eliminar' || pathname === '/api/ensaios-eliminar-ensaio') {
    return true;
  }

  if (pathname === '/api/ensaios-borrador') {
    return accion === 'gardarObra'
      || accion === 'eliminarObra'
      || accion === 'incluírPrograma'
      || accion === 'finalizar';
  }

  return false;
}

function requireXunta(pathname, accion) {
  return pathname === '/api/ensaios-borrador' && accion === 'gardarAsistencia';
}

function eRutaEnsaios(pathname) {
  return pathname === '/api/ensaios'
    || pathname === '/api/ensaios-eliminar'
    || pathname === '/api/ensaios-eliminar-ensaio'
    || pathname === '/api/ensaios-borrador';
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return context.next();

  const pathname = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  const relevante = pathname === '/api/partituras'
    || pathname === '/api/ensaios'
    || pathname === '/api/ensaios-eliminar'
    || pathname === '/api/ensaios-eliminar-ensaio'
    || pathname === '/api/ensaios-borrador';
  if (!relevante) return context.next();

  let body;
  try {
    body = await request.clone().json();
  } catch {
    return context.next();
  }

  const accion = String(body?.accion || '').trim();
  const precisaAdministracion = requireAdministracion(pathname, accion);
  const precisaXunta = requireXunta(pathname, accion);
  if (!precisaAdministracion && !precisaXunta) return context.next();

  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'O servizo de permisos non está configurado correctamente.' });
  }

  let user;
  try {
    user = await verificarFirebase(body.idToken, env.FIREBASE_API_KEY);
  } catch (error) {
    console.error('Erro ao validar Firebase no control de permisos:', error);
    return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
  }
  if (!user) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou.' });

  if (precisaAdministracion) {
    const permitido = eRutaEnsaios(pathname)
      ? await comprobarPermisoEnsaiosAdministracion(env, user)
      : await comprobarAdministracion(env, user);
    if (!permitido) {
      return json(403, {
        ok: false,
        codigo: 'ADMIN_REQUIRED',
        erro: pathname === '/api/partituras'
          ? 'Só a administración pode dar de alta ou eliminar partituras.'
          : 'Só a administración pode modificar a planificación ou o repertorio dos ensaios.'
      });
    }
  }

  if (precisaXunta) {
    const permitido = await comprobarPermisoEnsaiosAdministracion(env, user)
      || await comprobarAdministracion(env, user)
      || await comprobarXunta(env, user);
    if (!permitido) {
      return json(403, {
        ok: false,
        codigo: 'XUNTA_REQUIRED',
        erro: 'Só a Xunta Directiva ou a administración pode modificar a asistencia dos ensaios.'
      });
    }
  }

  return context.next();
}
