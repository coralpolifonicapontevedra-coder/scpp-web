const INDEX_KEY = 'indices/concertos-v1.json';
const PRIVATE_MAIN_INDEX_KEY = 'indices/concertos-privado-v1.json';

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

function proxeccionPublica(concerto = {}) {
  const nomeEs = clean(concerto.nomeEs || concerto.nome_es || concerto.Nome_ES || concerto.nombreEs || concerto.Nombre_ES);
  const caracteristicasEs = clean(
    concerto.caracteristicasEs || concerto.caracteristicas_es || concerto.Caracteristicas_ES ||
    concerto['Características_ES'] || concerto.descripcionEs || concerto.Descripcion_ES
  );
  return {
    id: clean(concerto.id || concerto.idConcerto),
    data: clean(concerto.data),
    nome: clean(concerto.nome || concerto.nombre),
    ...(nomeEs ? { nomeEs, nome_es: nomeEs } : {}),
    cidade: clean(concerto.cidade || concerto.ciudad),
    lugar: clean(concerto.lugar),
    caracteristicas: clean(concerto.caracteristicas || concerto.descripcion),
    ...(caracteristicasEs ? { caracteristicasEs, caracteristicas_es: caracteristicasEs } : {}),
    cartel: clean(concerto.cartel),
    triptico: clean(concerto.triptico),
    prensa: clean(concerto.prensa),
    hora: clean(concerto.hora),
    mostrarWeb: true,
    destacadoWeb: concerto.destacadoWeb === true,
    estado: clean(concerto.estado),
    programa: Array.isArray(concerto.programa) ? concerto.programa : []
  };
}

async function reconciliarPreviewCoIndicePrivado(env, indexPublico) {
  if (rama(env) === 'main' || !env.R2_PRIVADO?.get || !Array.isArray(indexPublico?.concertos)) {
    return { index: indexPublico, reconciliado: false };
  }

  const object = await env.R2_PRIVADO.get(PRIVATE_MAIN_INDEX_KEY).catch(() => null);
  const indexPrivado = object ? await object.json().catch(() => null) : null;
  if (indexPrivado?.ok !== true || !Array.isArray(indexPrivado?.concertos)) {
    return { index: indexPublico, reconciliado: false };
  }

  const publicosPrivados = indexPrivado.concertos
    .filter((concerto) => concerto?.mostrarWeb === true)
    .map(proxeccionPublica)
    .filter((concerto) => concerto.id && concerto.data && concerto.nome);

  if (!publicosPrivados.length) return { index: indexPublico, reconciliado: false };

  const idsPublicos = new Set(indexPublico.concertos.map((concerto) => clean(concerto?.id)).filter(Boolean));
  const faltanNoPublico = publicosPrivados.some((concerto) => !idsPublicos.has(concerto.id));
  const privadoMaisNovo = Number(indexPrivado.xeradoEnMs || 0) > Number(indexPublico.xeradoEnMs || 0);

  if (!faltanNoPublico && !privadoMaisNovo) {
    return { index: indexPublico, reconciliado: false };
  }

  const porId = new Map(
    indexPublico.concertos
      .filter((concerto) => clean(concerto?.id))
      .map((concerto) => [clean(concerto.id), concerto])
  );

  for (const concerto of publicosPrivados) {
    const previo = porId.get(concerto.id) || {};
    porId.set(concerto.id, { ...previo, ...concerto });
  }

  return {
    index: {
      ...indexPublico,
      concertos: [...porId.values()],
      reconciliadoDesde: 'R2-PRIVADO-MAIN',
      xeradoEnMsPrivado: Number(indexPrivado.xeradoEnMs || 0)
    },
    reconciliado: true
  };
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

  const indexLido = await object.json().catch(() => null);
  if (
    indexLido?.ok !== true ||
    Number(indexLido?.version) !== 1 ||
    !Array.isArray(indexLido?.concertos)
  ) {
    return json(503, { ok: false, erro: 'O índice de concertos non é válido.' }, {
      'X-SCPP-Concertos-Index': 'INVALID'
    });
  }

  const { index, reconciliado } = await reconciliarPreviewCoIndicePrivado(env, indexLido);
  const hoxe = hoxeMadrid();
  const concertos = index.concertos
    .filter((concerto) => estadoPublicable(concerto?.estado))
    .map((concerto) => aplicarEstadoAutomatico(concerto, hoxe))
    .filter(Boolean)
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
    'X-SCPP-Concertos-Index': reconciliado ? 'R2+PRIVATE-MAIN' : 'R2',
    'X-SCPP-Concertos-Version': String(index.xeradoEnMs || index.xeradoEn || ''),
    'X-SCPP-Concertos-Publication-Rule': 'previsto-confirmado-realizado-aprazado-auto-data',
    'Server-Timing': `r2;dur=${elapsed}`
  });
}