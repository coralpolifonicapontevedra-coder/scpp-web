const INDEX_MAIN = 'indices/concertos-privado-v1.json';
const INDEX_PREVIEW = 'indices/preview/concertos-privado-v1.json';

const clean = (value) => String(value ?? '').trim();
const indexKey = (env) => clean(env.CF_PAGES_BRANCH) === 'main' ? INDEX_MAIN : INDEX_PREVIEW;
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token || !apiKey) return null;
  const resposta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ idToken:token })
  });
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  return usuario?.email && usuario.emailVerified === true ? usuario : null;
}
function mimeCartel(nome = '', indicado = '') {
  const mime = clean(indicado).toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  const limpo = clean(nome).toLowerCase();
  if (limpo.endsWith('.png')) return 'image/png';
  if (limpo.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
async function rutaCartelExacta(env, concertoId) {
  const object = await env.R2_PRIVADO.get(indexKey(env));
  if (!object) return '';
  const indice = await object.json().catch(() => null);
  const concerto = (Array.isArray(indice?.concertos) ? indice.concertos : []).find((item) => clean(item?.id) === concertoId);
  const ruta = clean(concerto?.cartel);
  if (!ruta.startsWith('r2://')) return '';
  const key = ruta.slice(5);
  if (!key.startsWith('concertos/admin/') || !key.includes('/cartel/') || key.includes('..')) return '';
  return key;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok:false, erro:'Método non permitido' });
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500, { ok:false, erro:'O servizo de carteis non está configurado.' });

  const body = await request.json().catch(() => null);
  const usuario = await verificarTokenFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok:false, erro:'A identificación non é válida ou caducou' });

  const concertoId = clean(body?.concertoId);
  if (!concertoId || concertoId.length > 120) return json(400, { ok:false, erro:'O concerto indicado non é válido' });

  const key = await rutaCartelExacta(env, concertoId);
  if (!key) return json(404, { ok:false, erro:'Este concerto non ten un cartel R2 asociado no seu índice.' });
  const obxecto = await env.R2_PRIVADO.get(key);
  if (!obxecto) return json(404, { ok:false, erro:'O cartel asociado ao concerto non está dispoñible en R2.' });

  const nome = clean(key.split('/').pop() || 'cartel-concerto.jpg').replace(/[\r\n"]/g,'');
  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('Content-Type', mimeCartel(nome, obxecto.httpMetadata?.contentType));
  headers.set('Content-Disposition', `inline; filename="${nome}"`);
  headers.set('Cache-Control','private, max-age=300');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-SCPP-Storage','R2-PRIVADO-INDICE-EXACTO');
  return new Response(obxecto.body, { status:200, headers });
}
