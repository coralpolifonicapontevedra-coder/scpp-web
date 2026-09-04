import { invalidarPermisosPortal } from '../_lib/portal-permissions.js';

const PERMISSIONS_PREFIX = 'permisos/cache-v2/main/';
const MANAGEMENT_CACHE_KEY = 'permisos/xestion-cache-v1/main/listado.json';
const ADMIN_CONTEXT_PREFIX = 'persoas/cache/administracion/';
const MAX_MODULES = 32;

const clean = (value) => String(value || '').trim();
const emailValido = (value) => {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(email).toLowerCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function borrarPrefix(bucket, prefix) {
  if (!bucket?.list || !bucket?.delete) return 0;
  let cursor;
  let total = 0;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = Array.isArray(page?.objects) ? page.objects.map((item) => clean(item?.key)).filter(Boolean) : [];
    if (keys.length) {
      await bucket.delete(keys);
      total += keys.length;
    }
    cursor = page?.truncated ? clean(page?.cursor) : '';
  } while (cursor);
  return total;
}

async function borrarContextoAdministracion(env, email) {
  if (!env.R2_PRIVADO?.delete || !email) return false;
  await env.R2_PRIVADO.delete(`${ADMIN_CONTEXT_PREFIX}${await hashEmail(email)}.json`);
  return true;
}

async function borrarListado(env) {
  if (!env.R2_PRIVADO?.delete) return false;
  await env.R2_PRIVADO.delete(MANAGEMENT_CACHE_KEY);
  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (clean(env?.CF_PAGES_BRANCH) !== 'main') {
    return json(403, { ok: false, erro: 'Este endpoint só funciona en Produción.' });
  }
  if (!env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'A invalidación de permisos non está configurada.' });
  }

  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  if (!clean(data?.token) || clean(data.token) !== clean(env.WEB_WRITE_TOKEN)) {
    return json(403, { ok: false, erro: 'Token de sincronización non válido.' });
  }

  const accion = clean(data?.accion || 'invalidar');

  if (accion === 'invalidarListado') {
    await borrarListado(env);
    return json(200, { ok: true, accion, fonte: clean(data?.fonte) || 'descoñecida' });
  }

  if (accion === 'invalidarTodo') {
    const permisosEliminados = await borrarPrefix(env.R2_PRIVADO, PERMISSIONS_PREFIX);
    const contextosEliminados = await borrarPrefix(env.R2_PRIVADO, ADMIN_CONTEXT_PREFIX);
    await borrarListado(env);
    return json(200, {
      ok: true,
      accion,
      permisosEliminados,
      contextosEliminados,
      fonte: clean(data?.fonte) || 'descoñecida'
    });
  }

  if (accion !== 'invalidar') {
    return json(400, { ok: false, erro: 'Acción de invalidación descoñecida.' });
  }

  const email = emailValido(data?.email);
  const modulos = [...new Set((Array.isArray(data?.modulos) ? data.modulos : [data?.modulo])
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean))];

  if (!email || !modulos.length || modulos.length > MAX_MODULES) {
    return json(400, { ok: false, erro: 'Faltan usuario ou módulos válidos para invalidar.' });
  }

  await invalidarPermisosPortal(env, email, modulos);
  await borrarListado(env);

  let contextoAdministracionEliminado = false;
  if (modulos.includes('permisos')) {
    contextoAdministracionEliminado = await borrarContextoAdministracion(env, email);
  }

  return json(200, {
    ok: true,
    accion,
    email,
    modulos,
    contextoAdministracionEliminado,
    fonte: clean(data?.fonte) || 'descoñecida'
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  return onRequestPost(context);
}
