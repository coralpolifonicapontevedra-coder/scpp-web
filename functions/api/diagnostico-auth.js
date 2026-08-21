const json = (status, body) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function testarBucket(bucket) {
  if (!bucket || typeof bucket.list !== 'function') {
    return { configurado: false, accesible: false, erro: 'Binding non atopado' };
  }
  try {
    await bucket.list({ limit: 1 });
    return { configurado: true, accesible: true };
  } catch (erro) {
    return { configurado: true, accesible: false, erro: String(erro?.message || erro) };
  }
}

async function testarAppsScript(url, token) {
  if (!url) return { configurada: false, probada: false };

  const resultado = {
    configurada: true,
    urlMasked: url.substring(0, 45) + '...',
    get: null,
    post: null
  };

  // 1. Proba GET
  try {
    const controllerGet = new AbortController();
    const timerGet = setTimeout(() => controllerGet.abort(), 8000);
    const respGet = await fetch(url, { redirect: 'follow', signal: controllerGet.signal });
    clearTimeout(timerGet);

    const contentType = respGet.headers.get('content-type') || '';
    const texto = await respGet.text();
    let esJson = false;
    let jsonParsed = null;
    try {
      jsonParsed = JSON.parse(texto);
      esJson = true;
    } catch {
      esJson = false;
    }

    resultado.get = {
      status: respGet.status,
      contentType,
      esJson,
      ePaginaLoginGoogle: texto.includes('accounts.google.com') || texto.includes('ServiceLogin'),
      respostaResumo: esJson ? jsonParsed : (texto.length > 200 ? texto.substring(0, 200) + '...' : texto)
    };
  } catch (erro) {
    resultado.get = { erro: String(erro?.message || erro) };
  }

  // 2. Proba POST con token
  try {
    const controllerPost = new AbortController();
    const timerPost = setTimeout(() => controllerPost.abort(), 8000);
    const respPost = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: token || 'test-token',
        accion: 'obterTextoLegalVixente'
      }),
      redirect: 'follow',
      signal: controllerPost.signal
    });
    clearTimeout(timerPost);

    const contentType = respPost.headers.get('content-type') || '';
    const texto = await respPost.text();
    let esJson = false;
    let jsonParsed = null;
    try {
      jsonParsed = JSON.parse(texto);
      esJson = true;
    } catch {
      esJson = false;
    }

    resultado.post = {
      status: respPost.status,
      contentType,
      esJson,
      ePaginaLoginGoogle: texto.includes('accounts.google.com') || texto.includes('ServiceLogin'),
      respostaResumo: esJson ? jsonParsed : (texto.length > 200 ? texto.substring(0, 200) + '...' : texto)
    };
  } catch (erro) {
    resultado.post = { erro: String(erro?.message || erro) };
  }

  return resultado;
}

export async function onRequest(context) {
  const { env } = context;

  const [r2Privado, r2Publico, testeAppsScript] = await Promise.all([
    testarBucket(env.R2_PRIVADO),
    testarBucket(env.R2_PUBLICO),
    testarAppsScript(env.APPS_SCRIPT_WEBAPP_URL, env.WEB_WRITE_TOKEN)
  ]);

  const diagnostico = {
    data: new Date().toISOString(),
    ambiente: {
      FIREBASE_API_KEY: Boolean(env.FIREBASE_API_KEY) ? 'Configurada' : 'FALTA',
      WEB_WRITE_TOKEN: Boolean(env.WEB_WRITE_TOKEN) ? `Configurado (${env.WEB_WRITE_TOKEN.length} caracteres)` : 'FALTA',
      APPS_SCRIPT_WEBAPP_URL: Boolean(env.APPS_SCRIPT_WEBAPP_URL) ? 'Configurada' : 'FALTA',
      APPS_SCRIPT_FALLBACK_URL: Boolean(env.APPS_SCRIPT_FALLBACK_URL) ? 'Configurada' : 'Non definida'
    },
    r2: {
      R2_PRIVADO: r2Privado,
      R2_PUBLICO: r2Publico
    },
    appsScript: testeAppsScript,
    resumoProblema: null
  };

  if (!diagnostico.ambiente.FIREBASE_API_KEY.includes('Configurada')) {
    diagnostico.resumoProblema = 'Falta FIREBASE_API_KEY nas variables de contorno de Cloudflare Preview.';
  } else if (!diagnostico.ambiente.WEB_WRITE_TOKEN.includes('Configurado')) {
    diagnostico.resumoProblema = 'Falta WEB_WRITE_TOKEN nas variables de contorno de Cloudflare Preview.';
  } else if (!diagnostico.ambiente.APPS_SCRIPT_WEBAPP_URL.includes('Configurada')) {
    diagnostico.resumoProblema = 'Falta APPS_SCRIPT_WEBAPP_URL nas variables de contorno de Cloudflare Preview.';
  } else if (testeAppsScript?.post?.ePaginaLoginGoogle || testeAppsScript?.get?.ePaginaLoginGoogle) {
    diagnostico.resumoProblema = 'Google Apps Script está configurado con acceso restrinxido (pide login de Google). Debe configurarse con "Quen ten acceso: Calquera persoa" (Anyone).';
  } else if (testeAppsScript?.post?.esJson === false) {
    diagnostico.resumoProblema = 'Google Apps Script non devolveu JSON no POST. Revisa se a Web App está activa e despregada.';
  } else if (testeAppsScript?.post?.respostaResumo?.ok === false) {
    diagnostico.resumoProblema = `Google Apps Script rexeitou o POST: ${testeAppsScript.post.respostaResumo.erro || 'Erro descoñecido'}`;
  } else if (!r2Privado.accesible) {
    diagnostico.resumoProblema = 'O binding R2_PRIVADO non está accesible en Cloudflare Preview.';
  } else {
    diagnostico.resumoProblema = 'Todo parece configurado correctamente a nivel de conexións.';
  }

  return json(200, diagnostico);
}
