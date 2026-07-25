const MAX_BODY_BYTES = 24 * 1024;
const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1000;
const MIN_FORM_TIME_MS = 1500;

const ORIXES = new Set(['Contacto', 'Colabora', 'Portada']);
const TIPOS = new Set([
  'Contratación artística',
  'Consulta xeral',
  'Visita a ensaio',
  'Prensa e comunicación',
  'Quero cantar',
  'Alta de socio/a',
  'Colaboración económica',
  'Empresa ou mecenado',
  'Colaboración en especie',
  'Outra'
]);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

const texto = (value, maxLength) => String(value ?? '').trim().slice(0, maxLength);

function correoValido(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}

function solicitudeMesmoSitio(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.APPS_SCRIPT_WEBAPP_URL || !env.WEB_WRITE_TOKEN) {
    return json(500, { ok: false, erro: 'Falta a configuración segura do servizo' });
  }
  if (!solicitudeMesmoSitio(request)) {
    return json(403, { ok: false, erro: 'Orixe da solicitude non permitida' });
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, erro: 'A solicitude supera o tamaño permitido' });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  // Campo trampa: debe permanecer baleiro para usuarios reais.
  if (texto(datos.website, 200)) {
    return json(200, { ok: true, mensaxe: 'Solicitude recibida' });
  }

  const formStartedAt = Number(datos.formStartedAt || 0);
  const tempoFormulario = Date.now() - formStartedAt;
  if (!formStartedAt || tempoFormulario < MIN_FORM_TIME_MS || tempoFormulario > MAX_FORM_AGE_MS) {
    return json(400, { ok: false, erro: 'O formulario caducou. Recarga a páxina e téntao de novo.' });
  }

  const orixe = texto(datos.orixe, 30);
  const tipoSolicitude = texto(datos.tipoSolicitude, 80);
  const nomeCompleto = texto(datos.nomeCompleto, 140);
  const correoElectronico = texto(datos.correoElectronico, 160).toLowerCase();
  const telefono = texto(datos.telefono, 40);
  const entidade = texto(datos.entidade, 180);
  const cordaPreferente = texto(datos.cordaPreferente, 40);
  const experienciaCoral = texto(datos.experienciaCoral, 1200);
  const mensaxe = texto(datos.mensaxe, 4000);

  if (!ORIXES.has(orixe) || !TIPOS.has(tipoSolicitude)) {
    return json(400, { ok: false, erro: 'O tipo de solicitude non é válido' });
  }
  if (!nomeCompleto || !correoValido(correoElectronico) || !mensaxe) {
    return json(400, { ok: false, erro: 'Revisa o nome, o correo electrónico e a mensaxe' });
  }
  if (datos.aceptacionProteccionDatos !== true) {
    return json(400, { ok: false, erro: 'É necesario aceptar a información sobre protección de datos' });
  }
  if (tipoSolicitude === 'Quero cantar' && !cordaPreferente) {
    return json(400, { ok: false, erro: 'Indica a corda preferente' });
  }
  if (tipoSolicitude === 'Empresa ou mecenado' && !entidade) {
    return json(400, { ok: false, erro: 'Indica o nome da empresa ou entidade' });
  }

  const referenciaTecnica = [
    request.headers.get('CF-Ray') || '',
    texto(request.headers.get('User-Agent'), 180)
  ].filter(Boolean).join(' | ');

  try {
    const resposta = await fetch(env.APPS_SCRIPT_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: env.WEB_WRITE_TOKEN,
        accion: 'rexistrarSolicitudeWeb',
        orixe,
        tipoSolicitude,
        nomeCompleto,
        correoElectronico,
        telefono,
        entidade,
        cordaPreferente,
        experienciaCoral,
        mensaxe,
        aceptacionProteccionDatos: true,
        versionTextoLegal: texto(datos.versionTextoLegal, 80),
        fonteEntrada: 'Web pública',
        referenciaTecnica
      })
    });

    const respostaTexto = await resposta.text();
    let resultado;
    try {
      resultado = JSON.parse(respostaTexto);
    } catch {
      return json(502, { ok: false, erro: 'O servizo devolveu unha resposta non válida' });
    }

    if (!resultado.ok) {
      return json(400, { ok: false, erro: resultado.erro || 'Non foi posible gardar a solicitude' });
    }
    return json(200, resultado);
  } catch (erro) {
    console.error('Erro ao rexistrar a solicitude:', erro);
    return json(502, { ok: false, erro: 'Non foi posible contactar co servizo de solicitudes' });
  }
}
