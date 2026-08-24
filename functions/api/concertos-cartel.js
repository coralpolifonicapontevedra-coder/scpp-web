const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;

  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    }
  );

  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return usuario;
}

function mimeCartel(nome = '', indicado = '') {
  const mime = String(indicado || '').trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  const limpo = String(nome || '').toLowerCase();
  if (limpo.endsWith('.png')) return 'image/png';
  if (limpo.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo de carteis non está configurado.' });
  }

  const body = await request.json().catch(() => null);
  if (!body) return json(400, { ok: false, erro: 'Solicitude non válida' });

  const usuario = await verificarTokenFirebase(body.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const concertoId = String(body.concertoId || '').trim();
  if (!concertoId || concertoId.length > 120) {
    return json(400, { ok: false, erro: 'O concerto indicado non é válido' });
  }

  const prefix = `concertos/admin/${encodeURIComponent(concertoId)}/cartel/`;
  const lista = await env.R2_PRIVADO.list({ prefix, limit: 20 });
  const ultimo = [...lista.objects]
    .sort((a, b) => String(b.uploaded || '').localeCompare(String(a.uploaded || '')))[0];

  if (!ultimo) {
    return json(404, { ok: false, erro: 'Este concerto non ten un cartel novo en R2.' });
  }

  const obxecto = await env.R2_PRIVADO.get(ultimo.key);
  if (!obxecto) {
    return json(404, { ok: false, erro: 'O cartel non está dispoñible en R2.' });
  }

  const nome = String(ultimo.key.split('/').pop() || 'cartel-concerto.jpg')
    .replace(/[\r\n"]/g, '');
  const headers = new Headers();
  obxecto.writeHttpMetadata(headers);
  headers.set('Content-Type', mimeCartel(nome, obxecto.httpMetadata?.contentType));
  headers.set('Content-Disposition', `inline; filename="${nome}"`);
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-SCPP-Storage', 'R2-PRIVADO');

  return new Response(obxecto.body, { status: 200, headers });
}
