const INDEX_KEY = 'indices/concertos-v1.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

const normalizarEstado = (value = '') => String(value || '').trim().toLowerCase();
const estadoPublicable = (value = '') => ['previsto', 'confirmado', 'realizado', 'aprazado', 'aplazado'].includes(normalizarEstado(value));

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

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.R2_PUBLICO) {
    return json(500, { ok: false, erro: 'O bucket público R2 non está configurado.' }, {
      'X-SCPP-Concertos-Index': 'UNCONFIGURED'
    });
  }

  const started = Date.now();
  const object = await env.R2_PUBLICO.get(INDEX_KEY);
  if (!object) {
    return json(503, { ok: false, erro: 'O índice de concertos aínda non está dispoñible.' }, {
      'X-SCPP-Concertos-Index': 'MISSING'
    });
  }

  const index = await object.json().catch(() => null);
  if (
    index?.ok !== true ||
    Number(index?.version) !== 1 ||
    !Array.isArray(index?.concertos)
  ) {
    return json(503, { ok: false, erro: 'O índice de concertos non é válido.' }, {
      'X-SCPP-Concertos-Index': 'INVALID'
    });
  }

  const hoxe = hoxeMadrid();
  const concertos = index.concertos
    .filter((concerto) => estadoPublicable(concerto?.estado))
    .map((concerto) => aplicarEstadoAutomatico(concerto, hoxe))
    .filter(Boolean);
  const elapsed = Date.now() - started;

  return json(200, {
    ...index,
    total: concertos.length,
    concertos,
    regraPublicacion: 'Mostrar_Web + Previsto/Confirmado/Realizado/Aprazado; Previsto futuro publícase como próximo e Confirmado pasado pasa a Realizado',
    cache: 'R2',
    tempoRespostaMs: elapsed
  }, {
    'X-SCPP-Concertos-Index': 'R2',
    'X-SCPP-Concertos-Version': String(index.xeradoEnMs || index.xeradoEn || ''),
    'X-SCPP-Concertos-Publication-Rule': 'previsto-confirmado-realizado-aprazado-auto-data',
    'Server-Timing': `r2;dur=${elapsed}`
  });
}
