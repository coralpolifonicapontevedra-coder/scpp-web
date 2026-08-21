import { onRequest as onRequestAsistencias } from './asistencias-concertos.js';

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.searchParams.set('proba', '1');

  const request = new Request(url.toString(), context.request);
  const response = await onRequestAsistencias({ ...context, request });

  if (response.ok) return response;

  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object') return response;

  const diagnostico = body.diagnostico || {};
  const codigo = String(diagnostico.codigo || 'SEN_CODIGO');
  const estado = Number(diagnostico.estado || response.status || 0);
  const mensaxe = String(diagnostico.mensaxe || body.erro || 'Erro descoñecido');

  const headers = Object.fromEntries(response.headers.entries());
  return json(response.status, {
    ...body,
    erro: `${body.erro || 'Erro de asistencias'} [${codigo}/${estado}] ${mensaxe}`
  }, headers);
}
