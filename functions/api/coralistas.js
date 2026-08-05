const ORIXE = 'https://script.google.com/macros/s/AKfycbwKBDO5bvPxlXhsJTDvQHtx313rfN_BQIb3JX69X_qg6nZUOHDu183AGLh7JTIoN1a9/exec';
const INDEX_KEY = 'indices/coralistas-v1.json';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

const json = (status, body, cache = 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff'
    }
  });

const texto = (valor) => String(valor ?? '').trim();

function normalizarPersoa(persoa) {
  return {
    nome: texto(persoa?.nome),
    primeiroApelido: texto(persoa?.primeiroApelido),
    segundoApelido: texto(persoa?.segundoApelido),
    voz: texto(persoa?.voz)
  };
}

function respostaValida(datos) {
  return datos?.ok === true && Array.isArray(datos?.coralistas);
}

async function lerIndice(env) {
  if (!env.R2_PUBLICO) return null;
  const obxecto = await env.R2_PUBLICO.get(INDEX_KEY);
  if (!obxecto) return null;
  const datos = await obxecto.json().catch(() => null);
  return respostaValida(datos) ? datos : null;
}

async function gardarIndice(env, datos) {
  if (!env.R2_PUBLICO) return;
  await env.R2_PUBLICO.put(INDEX_KEY, JSON.stringify(datos), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400'
    }
  });
}

async function cargarDesdeSheet() {
  const resposta = await fetch(ORIXE, {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'application/json' }
  });
  if (!resposta.ok) throw new Error(`Apps Script respondeu HTTP ${resposta.status}`);
  const datos = await resposta.json();
  if (!respostaValida(datos)) throw new Error('Resposta de Apps Script non válida');

  const coralistas = datos.coralistas
    .map(normalizarPersoa)
    .filter((persoa) => persoa.nome && persoa.voz);

  return {
    ok: true,
    coralistas,
    total: coralistas.length,
    xeradoEn: new Date().toISOString(),
    xeradoEnMs: Date.now(),
    fonte: 'SHEET',
    version: 1
  };
}

export async function onRequestGet({ env, waitUntil }) {
  const indice = await lerIndice(env).catch(() => null);
  const idade = indice ? Date.now() - Number(indice.xeradoEnMs || 0) : Infinity;

  if (indice && idade < MAX_AGE_MS) {
    return json(200, { ...indice, fonte: 'R2-CACHE' });
  }

  try {
    const actualizado = await cargarDesdeSheet();
    const gardado = gardarIndice(env, actualizado);
    if (typeof waitUntil === 'function') waitUntil(gardado);
    else await gardado;
    return json(200, actualizado);
  } catch (erro) {
    if (indice) {
      return json(200, {
        ...indice,
        fonte: 'R2-STALE',
        aviso: 'Serviuse a última copia dispoñible porque a Sheet non respondeu.'
      });
    }
    return json(503, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non se puido cargar a relación de coralistas.'
    }, 'no-store');
  }
}
