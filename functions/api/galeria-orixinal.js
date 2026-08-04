function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function rutaSegura(ruta) {
  if (!ruta || ruta.startsWith('/') || ruta.includes('\\')) return false;
  const partes = ruta.split('/');
  return !partes.some((parte) => !parte || parte === '.' || parte === '..');
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.R2_PUBLICO) {
    return json(500, { ok: false, erro: 'O bucket público R2 non está configurado.' });
  }

  const url = new URL(request.url);
  const ruta = String(url.searchParams.get('ruta') || '').trim().replace(/^\/+/, '');
  if (!rutaSegura(ruta)) {
    return json(400, { ok: false, erro: 'Ruta de fotografía non válida.' });
  }

  const obxecto = await env.R2_PUBLICO.get(ruta, { onlyIf: request.headers });
  if (!obxecto) {
    return json(404, { ok: false, erro: 'A fotografía orixinal non existe.' });
  }

  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('ETag', obxecto.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Gallery-Asset', 'ORIGINAL');

  return new Response(request.method === 'HEAD' ? null : obxecto.body, {
    status: 200,
    headers
  });
}
