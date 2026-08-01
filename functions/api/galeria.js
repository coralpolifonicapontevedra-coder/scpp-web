import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const json = (status, body, cacheControl = 'no-store') => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl
    }
  }
);

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.WEB_WRITE_TOKEN) {
    return json(500, {
      ok: false,
      erro: 'O servizo da galería non está configurado correctamente.'
    });
  }

  try {
    const { resultado, usouRespaldo } = await obterJsonAppsScript(
      env,
      {
        token: env.WEB_WRITE_TOKEN,
        accion: 'listarFotosGaleria'
      },
      {
        timeoutMs: 75_000,
        attemptTimeoutMs: 30_000
      }
    );

    if (!resultado?.ok) {
      return json(502, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible cargar a galería.'
      });
    }

    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY'
      }
    });
  } catch (erro) {
    console.error('Erro ao cargar a galería pública:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT'
      ? 504
      : 503;

    return json(status, {
      ok: false,
      erro: 'A galería dinámica non está dispoñible neste momento.'
    });
  }
}
