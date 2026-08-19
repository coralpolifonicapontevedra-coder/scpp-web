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
  'listarAsistenciasConcertosPortal',
  'obterTextoLegalVixente',
  'comprobarAceptacion',
  'rexistrarAceptacion',
  'listarEnsaiosAdministracionPortal',
  'actualizarEnsaioAdministracionPortal',
  'listarConcertosAdministracionPortal',
  'actualizarConcertoAdministracionPortal'
]);

const PATRON_APPS_SCRIPT = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/;

export class AppsScriptError extends Error {
  constructor(message, code = 'APPS_SCRIPT_UNAVAILABLE', status = 0) {
    super(message);
    this.name = 'AppsScriptError';
    this.code = code;
    this.status = status;
  }
}

function urlPrincipalAppsScript(env = {}) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return PATRON_APPS_SCRIPT.test(url) ? url : '';
}

function urlsAppsScript(env = {}) {
  return [env.APPS_SCRIPT_WEBAPP_URL, env.APPS_SCRIPT_FALLBACK_URL, URL_RESPALDO_SCPP]
    .map((url) => String(url || '').trim())
    .filter((url, index, all) => PATRON_APPS_SCRIPT.test(url) && all.indexOf(url) === index);
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

function detalleRespostaNonJson(texto = '') {
  return String(texto)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export async function chamarAppsScriptRobusto(env, corpo, options = {}) {
  const timeoutSolicitadoMs = Math.max(4000, Number(options.timeoutMs) || 20000);
  const timeoutIntentoPreferido = Number(options.attemptTimeoutMs) || 0;
  const expectJson = options.expectJson === true;
  const accion = String(corpo?.accion || '').trim();
  const soPrincipal = ACCIONS_SO_PRINCIPAL.has(accion);
  const timeoutTotalMs = soPrincipal ? Math.max(45000, timeoutSolicitadoMs) : timeoutSolicitadoMs;
  const principal = urlPrincipalAppsScript(env);
  const urls = soPrincipal ? (principal ? [principal] : []) : urlsAppsScript(env);

  if (!urls.length) {
    const mensaxe = soPrincipal
      ? 'A acción require APPS_SCRIPT_WEBAPP_URL e non admite implementacións de respaldo.'
      : 'Non hai ningunha implementación de Apps Script configurada.';
    throw new AppsScriptError(mensaxe, 'APPS_SCRIPT_NOT_CONFIGURED');
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
      const resposta = await fetchConLimite(urls[index], {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(corpo)
      }, tempoIntento);

      ultimoEstado = resposta.status;
      if (resposta.ok) {
        if (expectJson) {
          const texto = await resposta.text();
          try {
            return { resposta, resultado: JSON.parse(texto), urlUsada: urls[index], usouRespaldo: index > 0, intento: index + 1 };
          } catch {
            houboRespostaNonValida = true;
            if (soPrincipal) {
              const detalle = detalleRespostaNonJson(texto);
              throw new AppsScriptError(
                `A implementación principal de Apps Script devolveu unha resposta non válida.${detalle ? ` Detalle: ${detalle}` : ''}`,
                'APPS_SCRIPT_INVALID_RESPONSE',
                resposta.status
              );
            }
            console.warn('Apps Script devolveu HTTP 200 cun corpo non JSON; probando a seguinte implementación.');
            continue;
          }
        }
        return { resposta, urlUsada: urls[index], usouRespaldo: index > 0, intento: index + 1 };
      }

      if (soPrincipal || !ESTADOS_RECUPERABLES.has(resposta.status)) {
        return { resposta, urlUsada: urls[index], usouRespaldo: false, intento: index + 1 };
      }
      console.warn(`Apps Script respondeu ${resposta.status}; probando a seguinte implementación.`);
    } catch (erro) {
      if (soPrincipal) {
        if (erro instanceof Error && erro.name === 'AbortError') {
          throw new AppsScriptError(
            'Apps Script tardou demasiado en responder. Tenta de novo nuns segundos.',
            'APPS_SCRIPT_TIMEOUT',
            ultimoEstado
          );
        }
        throw erro;
      }
      ultimoErro = erro;
      console.warn('Fallou unha implementación de Apps Script; probando a seguinte.', erro);
    }
  }

  if (ultimoErro instanceof Error && ultimoErro.name === 'AbortError') {
    throw new AppsScriptError('O servizo externo tardou demasiado en responder.', 'APPS_SCRIPT_TIMEOUT', ultimoEstado);
  }
  if (houboRespostaNonValida) {
    throw new AppsScriptError('O servizo de datos devolveu unha resposta non válida.', 'APPS_SCRIPT_INVALID_RESPONSE', ultimoEstado);
  }
  throw new AppsScriptError('Non se puido contactar con ningunha implementación dispoñible de Apps Script.', 'APPS_SCRIPT_UNAVAILABLE', ultimoEstado);
}

export async function obterJsonAppsScript(env, corpo, options = {}) {
  const resultadoFetch = await chamarAppsScriptRobusto(env, corpo, { ...options, expectJson: true });
  const { resposta, resultado } = resultadoFetch;
  if (!resposta.ok) {
    throw new AppsScriptError('O servizo de datos non está dispoñible neste momento.', 'APPS_SCRIPT_HTTP_ERROR', resposta.status);
  }
  return { ...resultadoFetch, resultado };
}
