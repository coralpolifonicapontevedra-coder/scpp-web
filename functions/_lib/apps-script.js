const URL_RESPALDO_SCPP = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';

const ESTADOS_RECUPERABLES = new Set([404, 408, 410, 425, 429, 500, 502, 503, 504]);

const ACCIONS_SO_PRINCIPAL = new Set([
  'subirFoto',
  'actualizarRevisionFoto',
  'eliminarFotoPortal',
  'actualizarPublicacionFoto',
  'obterFotoParaR2',
  'gardarRutasFotoR2',
  'listarFotosPublicadas',
  'listarFotosPendentesR2',
  'comprobarFotosAdministracionPortal',
  'gardarFotoAdministracionPortal',
  'listarAsistenciasConcertosPortal',
  'listarConcertosAdministracionPortal',
  'obterXestionConcertoAdministracionPortal',
  'actualizarConcertoAdministracionPortal',
  'gardarConcertoAdministracionPortal',
  'gardarProgramaConcertoAdministracionPortal',
  'gardarAsistentesConcertoAdministracionPortal',
  'actualizarMedioConcertoAdministracionPortal',
  'obterTextoLegalVixente',
  'comprobarAceptacion',
  'rexistrarAceptacion'
]);

export class AppsScriptError extends Error {
  constructor(message, code = 'APPS_SCRIPT_UNAVAILABLE', status = 0) {
    super(message);
    this.name = 'AppsScriptError';
    this.code = code;
    this.status = status;
  }
}

function urlsAppsScript(env = {}) {
  return [
    env.APPS_SCRIPT_WEBAPP_URL,
    env.APPS_SCRIPT_FALLBACK_URL,
    URL_RESPALDO_SCPP
  ]
    .map((url) => String(url || '').trim())
    .filter((url, index, all) => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) && all.indexOf(url) === index);
}

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function chamarAppsScriptRobusto(env, corpo, options = {}) {
  const timeoutTotalMs = Math.max(4000, Number(options.timeoutMs) || 20000);
  const timeoutIntentoPreferido = Number(options.attemptTimeoutMs) || 0;
  const expectJson = options.expectJson === true;
  const urlsConfiguradas = urlsAppsScript(env);
  const accion = String(corpo?.accion || '').trim();
  const urls = ACCIONS_SO_PRINCIPAL.has(accion)
    ? urlsConfiguradas.slice(0, 1)
    : urlsConfiguradas;

  if (!urls.length) {
    throw new AppsScriptError('Non hai ningunha implementación de Apps Script configurada.', 'APPS_SCRIPT_NOT_CONFIGURED');
  }

  const inicio = Date.now();
  let ultimoEstado = 0;
  let ultimoErro = null;
  let houboRespostaNonValida = false;

  for (let index = 0; index < urls.length; index += 1) {
    const restante = timeoutTotalMs - (Date.now() - inicio);
    if (restante <= 1000) break;

    const intentosRestantes = urls.length - index;
    const repartoAutomatico = Math.max(2500, Math.min(12000, Math.floor(restante / intentosRestantes)));
    const tempoIntento = index === urls.length - 1
      ? restante
      : Math.min(restante, timeoutIntentoPreferido > 0 ? timeoutIntentoPreferido : repartoAutomatico);

    try {
      const resposta = await fetchConLimite(
        urls[index],
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(corpo)
        },
        tempoIntento
      );

      ultimoEstado = resposta.status;
      if (resposta.ok) {
        if (expectJson) {
          const texto = await resposta.text();
          try {
            return {
              resposta,
              resultado: JSON.parse(texto),
              urlUsada: urls[index],
              usouRespaldo: index > 0,
              intento: index + 1
            };
          } catch {
            houboRespostaNonValida = true;
            console.warn('Apps Script devolveu HTTP 200 cun corpo non JSON; probando a seguinte implementación.');
            continue;
          }
        }

        return {
          resposta,
          urlUsada: urls[index],
          usouRespaldo: index > 0,
          intento: index + 1
        };
      }

      if (!ESTADOS_RECUPERABLES.has(resposta.status)) {
        return {
          resposta,
          urlUsada: urls[index],
          usouRespaldo: index > 0,
          intento: index + 1
        };
      }

      console.warn(`Apps Script respondeu ${resposta.status}; probando a seguinte implementación.`);
    } catch (erro) {
      ultimoErro = erro;
      console.warn('Fallou unha implementación de Apps Script; probando a seguinte.', erro);
    }
  }

  if (ultimoErro instanceof Error && ultimoErro.name === 'AbortError') {
    throw new AppsScriptError('O servizo externo tardou demasiado en responder.', 'APPS_SCRIPT_TIMEOUT', ultimoEstado);
  }

  if (houboRespostaNonValida) {
    throw new AppsScriptError(
      'O servizo de datos devolveu unha resposta non válida.',
      'APPS_SCRIPT_INVALID_RESPONSE',
      ultimoEstado
    );
  }

  throw new AppsScriptError(
    'Non se puido contactar con ningunha implementación dispoñible de Apps Script.',
    'APPS_SCRIPT_UNAVAILABLE',
    ultimoEstado
  );
}

export async function obterJsonAppsScript(env, corpo, options = {}) {
  const resultadoFetch = await chamarAppsScriptRobusto(env, corpo, {
    ...options,
    expectJson: true
  });
  const { resposta, resultado } = resultadoFetch;

  if (!resposta.ok) {
    throw new AppsScriptError(
      'O servizo de datos non está dispoñible neste momento.',
      'APPS_SCRIPT_HTTP_ERROR',
      resposta.status
    );
  }

  return { ...resultadoFetch, resultado };
}
