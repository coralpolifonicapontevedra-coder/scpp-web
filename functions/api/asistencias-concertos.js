import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...extraHeaders
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;

  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    }
  );

  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;

  return {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  const url = new URL(request.url);
  const modoProba = url.searchParams.has('proba');
  const inicio = Date.now();

  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, {
      ok: false,
      erro: 'O servizo non está configurado correctamente.',
      ...(modoProba ? {
        diagnostico: {
          fase: 'configuracion',
          webWriteToken: Boolean(env.WEB_WRITE_TOKEN),
          firebaseApiKey: Boolean(env.FIREBASE_API_KEY),
          appsScriptPrincipal: Boolean(env.APPS_SCRIPT_WEBAPP_URL)
        }
      } : {})
    });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  let usuario;
  try {
    usuario = await verificarTokenFirebase(datos.idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase para asistencias:', erro);
    if (modoProba) {
      return json(503, {
        ok: false,
        erro: 'Fallou a validación da sesión de Firebase.',
        diagnostico: {
          fase: 'firebase',
          tipo: erro instanceof Error ? erro.name : 'Erro descoñecido',
          mensaxe: erro instanceof Error ? erro.message : String(erro),
          tempoMs: Date.now() - inicio
        }
      });
    }
  }

  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  try {
    const { resultado, usouRespaldo, intento } = await obterJsonAppsScript(
      env,
      {
        token: env.WEB_WRITE_TOKEN,
        accion: 'listarAsistenciasConcertosPortal',
        email: usuario.email,
        uidFirebase: usuario.uid,
        cacheBust: Date.now()
      },
      {
        timeoutMs: 45_000,
        attemptTimeoutMs: 18_000
      }
    );

    if (!resultado?.ok) {
      return json(resultado?.erro === 'Usuario non autorizado' ? 403 : 400, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible consultar as asistencias.',
        ...(modoProba ? {
          diagnostico: {
            fase: 'apps-script-resposta',
            intento,
            usouRespaldo,
            tempoMs: Date.now() - inicio
          }
        } : {})
      });
    }

    const porConcerto = resultado.asistenciasPorConcerto;
    if (!porConcerto || typeof porConcerto !== 'object' || Array.isArray(porConcerto)) {
      return json(502, {
        ok: false,
        erro: 'A resposta de asistencias non ten o formato esperado.',
        ...(modoProba ? {
          diagnostico: {
            fase: 'formato',
            clavesResultado: Object.keys(resultado || {}),
            tempoMs: Date.now() - inicio
          }
        } : {})
      });
    }

    return json(200, {
      ...resultado,
      ...(modoProba ? {
        diagnostico: {
          fase: 'completada',
          intento,
          usouRespaldo,
          tempoMs: Date.now() - inicio
        }
      } : {})
    }, {
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
      'X-SCPP-AppScript-Attempt': String(intento),
      'X-SCPP-Concertos-Con-Asistencias': String(Object.keys(porConcerto).length),
      'X-SCPP-Tempo-Ms': String(Date.now() - inicio)
    });
  } catch (erro) {
    console.error('Erro no servizo directo de asistencias:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT'
      ? 504
      : 503;

    return json(status, {
      ok: false,
      erro: 'O servizo de asistencias non está dispoñible neste momento.',
      ...(modoProba ? {
        diagnostico: {
          fase: 'chamada-apps-script',
          codigo: erro instanceof AppsScriptError ? erro.code : 'ERRO_NON_CLASIFICADO',
          estadoExterno: erro instanceof AppsScriptError ? erro.status : 0,
          tipo: erro instanceof Error ? erro.name : 'Erro descoñecido',
          mensaxe: erro instanceof Error ? erro.message : String(erro),
          appsScriptPrincipalConfigurado: Boolean(env.APPS_SCRIPT_WEBAPP_URL),
          tempoMs: Date.now() - inicio
        }
      } : {})
    });
  }
}
