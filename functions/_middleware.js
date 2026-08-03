const IDS_AUDIO_DESACTIVADOS = new Set(['18', '35', '52', '67']);

function filtrarAudiosDesactivados(resultado) {
  if (!resultado || typeof resultado !== 'object') return resultado;

  const obras = Array.isArray(resultado.obras)
    ? resultado.obras
    : Array.isArray(resultado.repertorio)
      ? resultado.repertorio
      : Array.isArray(resultado.datos)
        ? resultado.datos
        : [];

  for (const obra of obras) {
    if (!obra || typeof obra !== 'object') continue;

    for (const campo of ['audios', 'audiosR2']) {
      if (!Array.isArray(obra[campo])) continue;
      obra[campo] = obra[campo].filter((audio) =>
        !IDS_AUDIO_DESACTIVADOS.has(String(audio?.id ?? '').trim())
      );
    }
  }

  if (resultado.indiceR2 && typeof resultado.indiceR2 === 'object') {
    resultado.indiceR2.audios = obras.reduce(
      (total, obra) => total + (Array.isArray(obra?.audios) ? obra.audios.length : 0),
      0
    );
  }

  return resultado;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();

  if (
    url.pathname !== '/api/repertorio' ||
    context.request.method !== 'POST' ||
    !String(response.headers.get('Content-Type') || '').includes('application/json')
  ) {
    return response;
  }

  let resultado;
  try {
    resultado = await response.clone().json();
  } catch {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-SCPP-Audios-Filter', 'desactivados-18-35-52-67');

  return new Response(
    JSON.stringify(filtrarAudiosDesactivados(resultado)),
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
}
