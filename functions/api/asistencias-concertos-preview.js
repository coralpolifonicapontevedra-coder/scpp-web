import { obterJsonAppsScript } from '../_lib/apps-script.js';

const CHAVE_PREVIEW = 'indices/preview/asistencias-concertos.json';
const CACHE_FRESCA_MS = 60 * 1000;

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

const rama = (env = {}) => String(env.CF_PAGES_BRANCH || '').trim();

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

function resultadoValido(resultado) {
  const porConcerto = resultado?.asistenciasPorConcerto;
  return Boolean(
    resultado?.ok === true &&
    porConcerto &&
    typeof porConcerto === 'object' &&
    !Array.isArray(porConcerto)
  );
}

async function lerCache(bucket) {
  if (!bucket?.get) return null;
  const obxecto = await bucket.get(CHAVE_PREVIEW);
  if (!obxecto) return null;
  const gardado = await obxecto.json().catch(() => null);
  if (!resultadoValido(gardado?.resultado)) return null;
  const gardadoEn = Number(gardado.gardadoEn || 0);
  return {
    resultado: gardado.resultado,
    gardadoEn,
    idadeMs: gardadoEn > 0 ? Math.max(0, Date.now() - gardadoEn) : Number.POSITIVE_INFINITY
  };
}

async function gardarCache(bucket, resultado) {
  if (!bucket?.put || !resultadoValido(resultado)) return;
  await bucket.put(
    CHAVE_PREVIEW,
    JSON.stringify({ gardadoEn: Date.now(), resultado }),
    {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'private, no-store'
      },
      customMetadata: {
        tipo: 'indice-asistencias-concertos-preview',
        version: '1'
      }
    }
  );
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (rama(env) === 'main') return json(404, { ok: false, erro: 'Endpoint dispoñible só en Preview.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo de Preview non está configurado.' });
  }

  const body = await request.json().catch(() => null);
  const usuario = await verificarTokenFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const cache = await lerCache(env.R2_PRIVADO);
  if (cache && cache.idadeMs <= CACHE_FRESCA_MS) {
    return json(200, cache.resultado, {
      'X-SCPP-Asistencias-Source': 'R2-PREVIEW-FRESH',
      'X-SCPP-Asistencias-Age': String(Math.round(cache.idadeMs / 1000))
    });
  }

  try {
    const { resultado, usouRespaldo } = await obterJsonAppsScript(
      env,
      {
        token: env.WEB_WRITE_TOKEN,
        accion: 'listarAsistenciasConcertosPortal',
        email: usuario.email,
        uidFirebase: usuario.uid,
        cacheBust: Date.now()
      },
      { timeoutMs: 24_000, attemptTimeoutMs: 24_000 }
    );

    if (!resultadoValido(resultado)) {
      throw new Error(resultado?.erro || 'A resposta de asistencias de Preview non é válida.');
    }

    await gardarCache(env.R2_PRIVADO, resultado);
    return json(200, resultado, {
      'X-SCPP-Asistencias-Source': 'APPS-SCRIPT-PREVIEW',
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY'
    });
  } catch (erro) {
    console.error('Non foi posible refrescar as asistencias de Preview:', erro);
    if (cache) {
      return json(200, cache.resultado, {
        'X-SCPP-Asistencias-Source': 'R2-PREVIEW-STALE',
        'X-SCPP-Asistencias-Age': String(Math.round(cache.idadeMs / 1000))
      });
    }
    return json(503, {
      ok: false,
      erro: 'Non foi posible cargar as asistencias desde as follas de probas.'
    });
  }
}
