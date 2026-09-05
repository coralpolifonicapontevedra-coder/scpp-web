const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

const clean = (v) => String(v ?? '').trim();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function firebase(token, key) {
  if (!token || !key) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  return user?.email && user.emailVerified
    ? { uid: clean(user.localId), email: clean(user.email).toLowerCase() }
    : null;
}

async function hash(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function admin(env, user) {
  const object = await env.R2_PRIVADO?.get?.(`persoas/cache/administracion/${await hash(user.email)}.json`);
  if (!object) return false;
  const data = await object.json().catch(() => null);
  return data?.administrador === user.email && data?.payload?.perfil?.nivel === 'Administración';
}

function safePart(value, fallback = 'arquivo') {
  const text = clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const safe = text.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  return safe || fallback;
}

function validKey(value) {
  const key = clean(value);
  return key.startsWith('arquivo/xustificantes/') && !key.includes('..') ? key : '';
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO?.put || !env.R2_PRIVADO?.get) {
    return json(500, { ok: false, erro: 'O almacén privado do arquivo non está configurado.' });
  }

  let form;
  try { form = await request.formData(); }
  catch { return json(400, { ok: false, erro: 'Non foi posible ler a solicitude.' }); }

  const user = await firebase(clean(form.get('idToken')), env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida.' });
  if (!(await admin(env, user))) return json(403, { ok: false, erro: 'Só Administración pode acceder aos xustificantes do arquivo.' });

  const accion = clean(form.get('accion'));
  if (accion === 'ler') {
    const key = validKey(form.get('ruta'));
    if (!key) return json(400, { ok: false, erro: 'A referencia do xustificante non é válida.' });
    const object = await env.R2_PRIVADO.get(key);
    if (!object) return json(404, { ok: false, erro: 'Non se atopou o xustificante no arquivo privado.' });
    const name = clean(object.customMetadata?.originalName) || key.split('/').pop() || 'xustificante';
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream');
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { status: 200, headers });
  }

  if (accion === 'eliminar') {
    const key = validKey(form.get('ruta'));
    if (!key) return json(400, { ok: false, erro: 'A referencia do xustificante non é válida.' });
    if (!env.R2_PRIVADO?.delete) return json(500, { ok: false, erro: 'O almacén privado non permite eliminar o xustificante.' });
    await env.R2_PRIVADO.delete(key);
    return json(200, { ok: true });
  }

  const idMovemento = clean(form.get('idMovemento'));
  if (!idMovemento) return json(400, { ok: false, erro: 'Falta o identificador do movemento.' });

  const file = form.get('file');
  if (!(file instanceof File)) return json(400, { ok: false, erro: 'Non se recibiu ningún ficheiro.' });
  if (!file.size || file.size > MAX_BYTES) return json(400, { ok: false, erro: 'O ficheiro debe ocupar como máximo 12 MB.' });

  const ext = ALLOWED.get(clean(file.type).toLowerCase());
  if (!ext) return json(400, { ok: false, erro: 'Formato non permitido. Usa PDF, Word, JPG, PNG ou WEBP.' });

  const bytes = await file.arrayBuffer();
  const original = safePart(file.name.replace(/\.[^.]+$/, ''), 'xustificante');
  const key = `arquivo/xustificantes/${safePart(idMovemento, 'movemento')}/${crypto.randomUUID()}-${original}.${ext}`;

  await env.R2_PRIVADO.put(key, bytes, {
    httpMetadata: { contentType: file.type, cacheControl: 'private, no-store, max-age=0' },
    customMetadata: {
      originalName: clean(file.name).slice(0, 180),
      movemento: idMovemento,
      uploadedBy: user.email,
      uploadedAt: new Date().toISOString()
    }
  });

  return json(200, { ok: true, ruta: key, nome: clean(file.name), bytes: file.size });
}
