import { onRequestFotosAdministracionV3 } from '../_lib/fotos-administracion-v3.js';
import { obterJsonAppsScript } from '../_lib/apps-script.js';

const texto = (valor) => String(valor ?? '').trim();

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarToken(idToken, apiKey) {
  const token = texto(idToken);
  if (!token || !apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
        signal: controller.signal
      }
    );
    if (!response.ok) return null;
    const user = (await response.json())?.users?.[0];
    if (!user?.email || user.emailVerified !== true) return null;
    return {
      uid: texto(user.localId),
      email: texto(user.email).toLowerCase()
    };
  } finally {
    clearTimeout(timer);
  }
}

async function recuperarDesdeDrive(env, usuario, datos) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    accion: 'obterFotoParaR2',
    email: usuario.email,
    uidFirebase: usuario.uid,
    idFoto: texto(datos.idFoto),
    rowId: texto(datos.idFoto),
    publicarPublica: datos.publicarPublica === true,
    publicarPrivada: datos.publicarPrivada === true
  }, { timeoutMs: 75_000, attemptTimeoutMs: 25_000 });

  if (!resultado?.ok) {
    throw new Error(resultado?.erro || 'Non se puido recuperar a fotografía orixinal desde Drive');
  }
  if (!texto(resultado.base64) || !texto(resultado.mimeType)) {
    throw new Error('Drive non devolveu unha fotografía válida para copiar a R2');
  }
  return resultado;
}

export async function onRequest(context) {
  const datos = await context.request.clone().json().catch(() => null);
  const primeiraResposta = await onRequestFotosAdministracionV3(context);

  if (!datos || texto(datos.base64)) return primeiraResposta;

  const primeiraMensaxe = await primeiraResposta.clone().json().catch(() => null);
  const faltaRuta = primeiraResposta.status === 503 &&
    primeiraMensaxe?.erro === 'A fotografía non ten unha ruta R2 recuperable';

  if (!faltaRuta || (!datos.publicarPublica && !datos.publicarPrivada)) {
    return primeiraResposta;
  }

  try {
    const usuario = await verificarToken(datos.idToken, context.env.FIREBASE_API_KEY);
    if (!usuario) {
      return json(401, { ok: false, erro: 'Identificación non válida ou caducada' });
    }

    const recuperada = await recuperarDesdeDrive(context.env, usuario, datos);
    const novaSolicitude = new Request(context.request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...datos,
        base64: recuperada.base64,
        mimeType: recuperada.mimeType
      })
    });

    return onRequestFotosAdministracionV3({
      ...context,
      request: novaSolicitude
    });
  } catch (error) {
    console.error('Erro recuperando fotografía desde Drive para R2:', error);
    return json(503, {
      ok: false,
      erro: error instanceof Error
        ? error.message
        : 'Non se puido recuperar a fotografía desde Drive para copiala a R2'
    });
  }
}
