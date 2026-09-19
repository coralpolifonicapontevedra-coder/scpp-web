const INDEX_KEY = 'indices/concertos-v1.json';
const MAIN_PUBLIC_ORIGIN = 'https://coralpolifonicapontevedra.org';
const MAIN_PUBLIC_API = `${MAIN_PUBLIC_ORIGIN}/api/concertos-indice`;

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

const clean = (value = '') => String(value ?? '').trim();
const rama = (env) => clean(env?.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
const normalizarEstado = (value = '') => String(value || '').trim().toLowerCase();
const estadoPublicable = (value = '') => ['previsto', 'confirmado', 'realizado', 'aprazado', 'aplazado'].includes(normalizarEstado(value));

const camposEspanolPreview = {
  aadc3347: {
    nomeEs: 'Cantos de Otoño',
    nome_es: 'Cantos de Otoño',
    caracteristicasEs: 'Festival coral con la participación del Orfeão Madeirense, la Coral Solera Berciana y la Sociedad Coral Polifónica de Pontevedra.',
    caracteristicas_es: 'Festival coral con la participación del Orfeão Madeirense, la Coral Solera Berciana y la Sociedad Coral Polifónica de Pontevedra.'
  },
  '7': {
    nomeEs: 'Concierto de Navidad',
    nome_es: 'Concierto de Navidad',
    caracteristicasEs: 'Concierto de villancicos de la Sociedad Coral Polifónica de Pontevedra en la Basílica de Santa María la Mayor.',
    caracteristicas_es: 'Concierto de villancicos de la Sociedad Coral Polifónica de Pontevedra en la Basílica de Santa María la Mayor.'
  }
};

function dataCanon(value = '') {
  const texto = String(value || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const partes = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!partes) return '';
  return `${partes[3]}-${String(partes[2]).padStart(2, '0')}-${String(partes[1]).padStart(2, '0')}`;
}

function hoxeMadrid() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (tipo) => partes.find((p) => p.type === tipo)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function aplicarEstadoAutomatico(concerto, hoxe) {
  const estado = normalizarEstado(concerto?.estado);
  const data = dataCanon(concerto?.data);

  if (estado === 'confirmado' && data && data < hoxe) {
    return { ...concerto, estado: 'Realizado', estadoAutomatico: true };
  }

  if (estado === 'previsto') {
    if (data && data < hoxe) return null;
    return { ...concerto, estado: 'Confirmado', estadoPublicoOrixinal: 'Previsto' };
  }

  return concerto;
}

function aplicarCamposEspanolPreview(concerto) {
  const extra = camposEspanolPreview[String(concerto?.id || '')];
  return extra ? { ...concerto, ...extra } : concerto;
}

function urlMediaMain(ruta = '') {
  const valor = clean(ruta).replaceAll('\\', '/');
  if (!valor) return '';
  if (/^https?:\/\//i.test(valor)) return valor;
  const nome = valor.split('/').filter(Boolean).pop();
  if (!nome) return '';
  const miniatura = nome.replace(/\.pdf$/i, '.jpg');
  return `${MAIN_PUBLIC_ORIGIN}/media/concertos/${encodeURIComponent(miniatura)}`;
}

function aplicarMediosMainPreview(concerto) {
  if (!concerto) return concerto;
  const cartel = urlMediaMain(concerto.cartel);
  return cartel ? { ...concerto, cartel } : concerto;
}

function indiceValido(index) {
  return index?.ok === true && Number(index?.version) === 1 && Array.isArray(index?.concertos);
}

async function lerIndiceMainDesdePreview(env) {
  if (rama(env) === 'main') return null;
  try {
    const resposta = await fetch(MAIN_PUBLIC_API, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    const index = await resposta.json().catch(() => null);
    return resposta.ok && indiceValido(index) ? index : null;
  } catch (error) {
    console.warn('Non se puido ler o índice público de main desde Preview:', error);
    return null;
  }
}

async function lerIndiceR2(env) {
  if (!env.R2_PUBLICO) return null;
  const object = await env.R2_PUBLICO.get(INDEX_KEY);
  if (!object) return null;
  const index = await object.json().catch(() => null);
  return indiceValido(index) ? index : null;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  const started = Date.now();

  // En Preview usamos como referencia o índice público de main. É o índice que
  // Administración actualiza inmediatamente ao gardar e xa incorpora a regra
  // de publicar os concertos futuros en estado Previsto cando Mostrar_Web está activo.
  let index = await lerIndiceMainDesdePreview(env);
  let fonte = index ? 'MAIN-6CC99D4' : 'R2';

  if (!index) {
    index = await lerIndiceR2(env);
  }

  if (!index) {
    return json(503, { ok: false, erro: 'O índice de concertos aínda non está dispoñible.' }, {
      'X-SCPP-Concertos-Index': 'MISSING'
    });
  }

  const hoxe = hoxeMadrid();
  const desdeMain = fonte === 'MAIN-6CC99D4';
  const concertos = index.concertos
    .filter((concerto) => estadoPublicable(concerto?.estado))
    .map((concerto) => aplicarEstadoAutomatico(concerto, hoxe))
    .filter(Boolean)
    .map((concerto) => desdeMain ? aplicarMediosMainPreview(concerto) : concerto)
    .map(aplicarCamposEspanolPreview);
  const elapsed = Date.now() - started;

  return json(200, {
    ...index,
    total: concertos.length,
    concertos,
    regraPublicacion: 'Mostrar_Web + Previsto/Confirmado/Realizado/Aprazado; Previsto futuro publícase como próximo e Confirmado pasado pasa a Realizado',
    cache: 'R2',
    tempoRespostaMs: elapsed
  }, {
    'X-SCPP-Concertos-Index': fonte,
    'X-SCPP-Concertos-Version': String(index.xeradoEnMs || index.xeradoEn || ''),
    'X-SCPP-Concertos-Publication-Rule': 'previsto-confirmado-realizado-aprazado-auto-data',
    'Server-Timing': `r2;dur=${elapsed}`
  });
}