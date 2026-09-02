import { obterJsonAppsScript } from '../_lib/apps-script.js';

const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';

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

async function hashEmail(email) {
  const bytes = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function obterContextoAdministracion(env, user) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') {
    return { administrador: false, resultado: null, coñecido: false };
  }

  try {
    const object = await env.R2_PRIVADO.get(`${ADMIN_CACHE_PREFIX}${await hashEmail(user.email)}.json`);
    if (!object) return { administrador: false, resultado: null, coñecido: false };

    const entry = await object.json().catch(() => null);
    const administrador = String(entry?.administrador || '').trim().toLowerCase() === user.email
      && entry?.payload?.perfil?.nivel === 'Administración';

    return {
      administrador,
      resultado: administrador ? entry?.payload || null : null,
      coñecido: true
    };
  } catch (error) {
    console.error('Erro ao comprobar administración en R2 para permisos:', error);
    return { administrador: false, resultado: null, coñecido: false };
  }
}

function fusionarPersoasConUsuarios(resultadoPermisos, resultadoPersoas) {
  const usuarios = Array.isArray(resultadoPermisos?.usuarios) ? resultadoPermisos.usuarios : [];
  const persoas = Array.isArray(resultadoPersoas?.persoas) ? resultadoPersoas.persoas : [];
  const porEmail = new Map();

  usuarios.forEach((usuario) => {
    const email = String(usuario?.email || '').trim().toLowerCase();
    if (!email) return;
    porEmail.set(email, {
      ...usuario,
      email,
      nome: String(usuario?.nome || usuario?.persoa || email).trim(),
      tenUsuarioWeb: true
    });
  });

  persoas.forEach((persoa) => {
    if (persoa?.activo === false) return;
    const email = String(persoa?.correo || '').trim().toLowerCase();
    if (!email) return;

    const existente = porEmail.get(email);
    const nome = String(
      persoa?.nomeCompleto ||
      [persoa?.nome, persoa?.primeiroApelido, persoa?.segundoApelido].filter(Boolean).join(' ') ||
      existente?.nome ||
      email
    ).trim();

    porEmail.set(email, {
      ...(existente || {}),
      email,
      persoa: String(persoa?.rowId || persoa?.idPersoa || persoa?.id || existente?.persoa || '').trim(),
      nome,
      activo: true,
      tenUsuarioWeb: Boolean(existente?.tenUsuarioWeb)
    });
  });

  return Array.from(porEmail.values()).sort((a, b) =>
    String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'gl', { sensitivity: 'base' })
  );
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
    'gardarPermisosPortalLote',
    'eliminarPermisoPortal',
    'listarActividadePortal',
    'rexistrarActividadePortal',
    'obterPermisosUsuarioPortal'
  ]);

  if (!permitidas.has(accion)) {
    return json(400, { ok: false, erro: 'Acción de permisos descoñecida.' });
  }

  let contextoAdmin = { administrador: false, resultado: null, coñecido: false };
  if (accion === 'listarPermisosPortal') {
    contextoAdmin = await obterContextoAdministracion(env, user);
    if (!contextoAdmin.administrador) {
      return json(403, {
        ok: false,
        codigo: contextoAdmin.coñecido ? 'ADMIN_REQUIRED' : 'ADMIN_CACHE_UNAVAILABLE',
        erro: contextoAdmin.coñecido
          ? 'A túa conta non ten permisos de administración para esta operación.'
          : 'Non foi posible comprobar o acceso administrativo neste momento.'
      });
    }
  }

  const payload = {
    ...body,
    token: env.WEB_WRITE_TOKEN,
    email: user.email,
    uidFirebase: user.uid,
    actorEmail: user.email
  };

  if (accion === 'obterPermisosUsuarioPortal') {
    payload.usuarioEmail = user.email;
  }

  delete payload.idToken;

  try {
    const { resultado } = await obterJsonAppsScript(env, payload, {
      timeoutMs: accion === 'gardarPermisosPortalLote' ? 30000 : 20000,
      attemptTimeoutMs: accion === 'gardarPermisosPortalLote' ? 15000 : 9000
    });

    if (!resultado?.ok) {
      const status = resultado?.codigo === 'ADMIN_REQUIRED' ? 403 : 400;
      return json(status, resultado || { ok: false, erro: 'Non foi posible completar a operación.' });
    }

    if (accion === 'listarPermisosPortal' && contextoAdmin.resultado) {
      resultado.usuarios = fusionarPersoasConUsuarios(resultado, contextoAdmin.resultado);
    }

    return json(200, {
      ...resultado,
      administrador: accion === 'listarPermisosPortal' ? contextoAdmin.administrador : undefined
    });
  } catch (error) {
    console.error('Erro na API de permisos:', error);
    return json(502, { ok: false, erro: 'Non foi posible contactar co servizo de permisos.' });
  }
}
