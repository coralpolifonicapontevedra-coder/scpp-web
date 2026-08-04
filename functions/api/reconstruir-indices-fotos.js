const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

/**
 * Reconstrutor xeral bloqueado temporalmente.
 *
 * Os índices público e privado teñen sincronizadores específicos que conservan
 * rutas, miniaturas e metadatos verificados. Unha reconstrución xenérica non
 * debe sobrescribilos.
 */
export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  return json(409, {
    ok: false,
    bloqueado: true,
    erro: 'A reconstrución xeral está desactivada para protexer as galerías. Usa os sincronizadores específicos público e privado.'
  });
}
