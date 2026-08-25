import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';
import { CONCERT_PROGRAM_BY_ID } from '../_data/concert-media-r2.js';

const INDEX_MAIN = 'indices/concertos-privado-v1.json';
const INDEX_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const clean = (value) => String(value ?? '').trim();
const indexKey = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? INDEX_MAIN : INDEX_PREVIEW;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

function mimePorNome(nome = '') {
  const limpo = String(nome || '').toLowerCase().split('?')[0];
  if (limpo.endsWith('.pdf')) return 'application/pdf';
  if (limpo.endsWith('.jpg') || limpo.endsWith('.jpeg')) return 'image/jpeg';
  if (limpo.endsWith('.png')) return 'image/png';
  if (limpo.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}
function mimeDocumento(mime = '', nome = '') {
  const indicado = String(mime || '').trim().toLowerCase();
  if (indicado && indicado !== 'application/octet-stream') return indicado;
  return mimePorNome(nome);
}

async function verificarTokenFirebase(idToken, apiKey) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return { uid: String(usuario.localId || ''), email: String(usuario.email).trim().toLowerCase() };
}

function respostaFicheiro(resultado) {
  const base64 = String(resultado.base64 || '');
  if (!base64) return json(502, { ok: false, erro: 'O documento chegou baleiro' });
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const nome = String(resultado.nomeFicheiro || 'programa-concerto').replace(/[\r\n"]/g, '');
  const mime = mimeDocumento(resultado.mimeType, nome);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function rutaTripticoExacta(env, concertoId) {
  if (!env.R2_PRIVADO?.get) return '';
  const object = await env.R2_PRIVADO.get(indexKey(env));
  if (!object) return '';
  const indice = await object.json().catch(() => null);
  const concerto = (Array.isArray(indice?.concertos) ? indice.concertos : []).find((item) => clean(item?.id) === concertoId);
  const ruta = clean(concerto?.triptico);
  if (!ruta.startsWith('r2://')) return '';
  const key = ruta.slice(5);
  if (!key.startsWith('concertos/admin/') || !key.includes('/triptico/') || key.includes('..')) return '';
  return key;
}

async function respostaObxectoR2(env, r2Key, nomeIndicado = '', mimeIndicado = '') {
  if (!env.R2_PRIVADO || !r2Key) return null;
  const obxecto = await env.R2_PRIVADO.get(r2Key);
  if (!obxecto) return null;
  const nome = String(nomeIndicado || r2Key.split('/').pop() || 'programa-concerto').replace(/[\r\n"]/g, '');
  const mime = mimeDocumento(mimeIndicado || obxecto.httpMetadata?.contentType, nome);
  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('Content-Type', mime);
  headers.set('Content-Disposition', `inline; filename="${nome}"`);
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Storage', 'R2-INDICE-EXACTO');
  return new Response(obxecto.body, { status: 200, headers });
}

async function respostaProgramaR2(env, concertoId) {
  if (!env.R2_PRIVADO) return null;
  try {
    const exacta = await rutaTripticoExacta(env, concertoId);
    if (exacta) {
      const resposta = await respostaObxectoR2(env, exacta);
      if (resposta) return resposta;
    }

    const entrada = CONCERT_PROGRAM_BY_ID[concertoId];
    if (!entrada) return null;
    return respostaObxectoR2(env, entrada.r2Key, entrada.name, entrada.mimeType);
  } catch (erro) {
    console.warn('Non foi posible abrir o programa do concerto desde R2:', erro);
    return null;
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });

  let datos;
  try { datos = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude non válida' }); }

  let usuario;
  try { usuario = await verificarTokenFirebase(String(datos.idToken || '').trim(), env.FIREBASE_API_KEY); }
  catch (erro) { console.error('Erro ao validar Firebase:', erro); }
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });

  const accion = String(datos.accion || '').trim();
  if (accion !== 'obterDocumentoConcerto') return json(400, { ok: false, erro: 'Acción non permitida' });

  const concertoId = String(datos.concertoId || '').trim();
  if (!concertoId || concertoId.length > 120) return json(400, { ok: false, erro: 'O concerto indicado non é válido' });

  const programaR2 = await respostaProgramaR2(env, concertoId);
  if (programaR2) return programaR2;

  try {
    const { resultado, usouRespaldo } = await obterJsonAppsScript(
      env,
      {
        token: env.WEB_WRITE_TOKEN,
        accion,
        email: usuario.email,
        uidFirebase: usuario.uid,
        concertoId
      },
      { timeoutMs: 45_000, attemptTimeoutMs: 15_000 }
    );

    if (!resultado?.ok) {
      const estado = resultado?.erro === 'Usuario non autorizado' ? 403 : 400;
      return json(estado, { ok: false, erro: resultado?.erro || 'Non foi posible abrir o documento do concerto.' });
    }

    const resposta = respostaFicheiro(resultado);
    if (usouRespaldo) resposta.headers.set('X-SCPP-AppScript', 'FALLBACK');
    return resposta;
  } catch (erro) {
    console.error('Erro no servizo de concertos:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, { ok: false, erro: 'O documento do concerto non está dispoñible neste momento. Tenta de novo nuns segundos.' });
  }
}
