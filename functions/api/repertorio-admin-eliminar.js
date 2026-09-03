import { obterJsonAppsScript } from '../_lib/apps-script.js';

const APPS_SCRIPT_PRODUCION = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const APPS_SCRIPT_PREVIEW = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});
const clean = (value) => String(value ?? '').trim();

function ramaActual(env) {
  return clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
}
function appsScriptUrl(env) {
  return ramaActual(env) === 'main' ? APPS_SCRIPT_PRODUCION : APPS_SCRIPT_PREVIEW;
}
function cacheKey(env) {
  return `repertorio/cache/administracion/${ramaActual(env)}/listado-v2.json`;
}

async function verificarFirebase(token, apiKey) {
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  return user?.email && user.emailVerified
    ? { uid: clean(user.localId), email: clean(user.email).toLowerCase() }
    : null;
}

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function eAdministrador(env, user) {
  const object = await env.R2_PRIVADO?.get?.(`persoas/cache/administracion/${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const data = await object.json().catch(() => null);
  return data?.administrador === user.email && data?.payload?.perfil?.nivel === 'Administración';
}

async function chamarAppsScript(env, user, tipo, id) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    email: user.email,
    uidFirebase: user.uid,
    accion: 'eliminarRecursoRepertorioAdministracion',
    tipo,
    id
  }, {
    timeoutMs: 30000,
    attemptTimeoutMs: 12000,
    urlOverride: appsScriptUrl(env)
  });
  return resultado;
}

function r2KeySeguro(tipo, value) {
  const key = clean(value).replace(/^\/+/, '');
  if (!key || key.includes('..') || key.includes('\\')) return '';
  if (tipo === 'partitura' && key.startsWith('partituras/')) return key;
  if (tipo === 'audio' && key.startsWith('repertorio/audios/')) return key;
  return '';
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok:false, erro:'O servizo non está configurado correctamente.' });
  }

  let body;
  try { body = await request.json(); }
  catch { return json(400, { ok:false, erro:'Solicitude non válida.' }); }

  const user = await verificarFirebase(clean(body.idToken), env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok:false, erro:'A sesión non é válida.' });
  if (!(await eAdministrador(env, user))) {
    return json(403, { ok:false, erro:'Só Administración pode eliminar rexistros do repertorio.' });
  }

  if (clean(body.accion) !== 'eliminarRecursoRepertorioAdministracion') {
    return json(400, { ok:false, erro:'Acción non permitida.' });
  }
  const tipo = clean(body.tipo);
  const id = clean(body.id);
  if (!['obra', 'partitura', 'audio'].includes(tipo) || !id) {
    return json(400, { ok:false, erro:'Rexistro non válido.' });
  }

  try {
    const resultado = await chamarAppsScript(env, user, tipo, id);
    if (!resultado?.ok) {
      const status = resultado?.codigo === 'DEPENDENCIAS' ? 409 : resultado?.codigo === 'NOT_FOUND' ? 404 : 400;
      return json(status, resultado || { ok:false, erro:'Non foi posible eliminar o rexistro.' });
    }

    let r2Limpo = true;
    const key = r2KeySeguro(tipo, resultado.r2Key);
    if (key && env.R2_PRIVADO?.delete) {
      try { await env.R2_PRIVADO.delete(key); }
      catch (error) {
        console.error('Rexistro eliminado pero fallou a limpeza R2:', key, error);
        r2Limpo = false;
      }
    }

    if (env.R2_PRIVADO?.delete) {
      await env.R2_PRIVADO.delete(cacheKey(env)).catch(() => {});
    }

    return json(200, {
      ok:true,
      tipo,
      id,
      nome:clean(resultado.nome),
      r2Key:key,
      r2Limpo
    });
  } catch (error) {
    return json(502, {
      ok:false,
      codigo:error?.code || 'REPERTORIO_DELETE_ERROR',
      erro:error instanceof Error ? error.message : 'Non foi posible eliminar o rexistro.'
    });
  }
}
