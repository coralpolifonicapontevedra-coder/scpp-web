const REVIEW_PREFIX = 'persoas/revisions/';

const clean = (value) => String(value == null ? '' : value).trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
});

function tokenValido(value) {
  const token = clean(value);
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : '';
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.R2_PRIVADO?.get || !env.WEB_WRITE_TOKEN) return json(503, { ok: false, erro: 'A sincronización non está dispoñible.' });

  let data;
  try { data = await request.json(); }
  catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  const token = tokenValido(data?.token);
  if (!token) return json(400, { ok: false, erro: 'A ligazón de revisión non é válida.' });
  const object = await env.R2_PRIVADO.get(`${REVIEW_PREFIX}${token}.json`);
  const revision = object ? await object.json().catch(() => null) : null;
  if (revision?.token !== token || revision?.estado !== 'COMPLETADA' || !revision?.idPersoa) {
    return json(403, { ok: false, erro: 'A revisión non está completada.' });
  }

  const target = new URL('/api/persoas-cache-sync', request.url);
  const response = await fetch(target.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: env.WEB_WRITE_TOKEN,
      fonte: 'revision-publica',
      idPersoa: clean(revision.idPersoa)
    })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    return json(503, { ok: false, erro: result?.erro || 'A revisión gardouse, pero non se puido actualizar a copia R2.' });
  }
  return json(200, { ok: true, idPersoa: clean(revision.idPersoa), cacheActualizada: true });
}
