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

function ePreview(url, env) {
  const rama = String(env?.CF_PAGES_BRANCH || '').trim();
  return rama !== 'main' || url.hostname.endsWith('.scpp-web.pages.dev');
}

async function desdeProducion(request, url) {
  const destino = new URL('/api/galeria-orixinal', 'https://coralpolifonicapontevedra.org');
  destino.search = url.search;
  const resposta = await fetch(destino.toString(), {
    method: request.method,
    headers: {
      'Accept': request.headers.get('Accept') || '*/*',
      'If-None-Match': request.headers.get('If-None-Match') || ''
    },
    redirect: 'follow'
  });

  if (!resposta.ok && resposta.status !== 304) return null;

  const headers = new Headers(resposta.headers);
  headers.set('X-SCPP-Gallery-Preview-Fallback', 'PRODUCTION');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(request.method === 'HEAD' ? null : resposta.body, {
    status: resposta.status,
    headers
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  const url = new URL(request.url);
  const ruta = String(url.searchParams.get('ruta') || '').trim().replace(/^\/+/, '');
  if (!rutaSegura(ruta)) {
    return json(400, { ok: false, erro: 'Ruta de fotografía non válida.' });
  }

  if (!env.R2_PUBLICO) {
    if (ePreview(url, env)) {
      const fallback = await desdeProducion(request, url).catch(() => null);
      if (fallback) return fallback;
    }
    return json(500, { ok: false, erro: 'O bucket público R2 non está configurado.' });
  }

  let obxecto = null;
  try {
    obxecto = await env.R2_PUBLICO.get(ruta, { onlyIf: request.headers });
  } catch {
    obxecto = null;
  }

  if (!obxecto) {
    if (ePreview(url, env)) {
      const fallback = await desdeProducion(request, url).catch(() => null);
      if (fallback) return fallback;
    }
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
