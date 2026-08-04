function respostaJson(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function obterRuta(params) {
  const valor = params?.path;
  const partes = Array.isArray(valor) ? valor : String(valor || '').split('/');
  return partes
    .map((parte) => {
      try { return decodeURIComponent(String(parte || '')); }
      catch { return String(parte || ''); }
    })
    .filter(Boolean)
    .join('/');
}

function rutaSegura(ruta) {
  if (!ruta || ruta.startsWith('/') || ruta.includes('\\')) return false;
  const partes = ruta.split('/');
  return !partes.some((parte) => !parte || parte === '.' || parte === '..');
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return respostaJson(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.R2_PUBLICO) {
    return respostaJson(500, { ok: false, erro: 'O bucket público non está configurado.' });
  }

  const ruta = obterRuta(params);
  if (!rutaSegura(ruta)) {
    return respostaJson(400, { ok: false, erro: 'Ruta de ficheiro non válida.' });
  }

  const obxecto = await env.R2_PUBLICO.get(ruta, {
    onlyIf: request.headers
  });

  if (!obxecto) {
    return respostaJson(404, { ok: false, erro: 'O ficheiro non existe.' });
  }

  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('ETag', obxecto.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Access-Control-Allow-Origin', '*');

  if (obxecto.range) {
    const offset = obxecto.range.offset ?? 0;
    const length = obxecto.range.length ?? obxecto.size;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${obxecto.size}`);
    headers.set('Accept-Ranges', 'bytes');
  }

  return new Response(request.method === 'HEAD' ? null : obxecto.body, {
    status: obxecto.range ? 206 : 200,
    headers
  });
}
