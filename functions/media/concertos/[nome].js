import { concertMediaByName } from '../../_data/concert-media-r2.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

function nomeSolicitado(params) {
  try { return decodeURIComponent(String(params?.nome || '')); }
  catch { return ''; }
}

async function respaldoEstatico(request, env, nome) {
  if (!env.ASSETS || !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(nome)) return null;
  const url = new URL(request.url);
  url.pathname = `/img/concertos/${encodeURIComponent(nome)}`;
  const resposta = await env.ASSETS.fetch(new Request(url, request));
  if (!resposta.ok) return null;
  const headers = new Headers(resposta.headers);
  headers.set('X-SCPP-Storage', 'PAGES-FALLBACK');
  return new Response(request.method === 'HEAD' ? null : resposta.body, {
    status: resposta.status,
    headers
  });
}

export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  const nome = nomeSolicitado(params);
  const entrada = concertMediaByName(nome);
  if (!entrada) return json(404, { ok: false, erro: 'O material non existe.' });

  if (env.R2_PRIVADO) {
    try {
      const obxecto = await env.R2_PRIVADO.get(entrada.r2Key, { onlyIf: request.headers });
      if (obxecto) {
        const headers = new Headers();
        obxecto.writeHttpMetadata(headers);
        headers.set('Content-Type', entrada.mimeType);
        headers.set('Content-Disposition', `inline; filename="${entrada.name.replace(/[\r\n"]/g, '')}"`);
        headers.set('ETag', obxecto.httpEtag);
        headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('X-SCPP-Storage', 'R2');
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
    } catch (erro) {
      console.warn('Non foi posible servir o material do concerto desde R2:', erro);
    }
  }

  const respaldo = await respaldoEstatico(request, env, nome);
  return respaldo || json(503, { ok: false, erro: 'O material non está dispoñible neste momento.' });
}

