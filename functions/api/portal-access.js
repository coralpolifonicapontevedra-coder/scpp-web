const ADMIN_CACHE_PREFIX = 'persoas/cache/administracion/';
const REVIEW_CACHE_PREFIX = 'cache/autorizacion-fotos/';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FIREBASE_TIMEOUT_MS = 6000;

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  }
});

async function hashEmail(email) {
  const bytes = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIREBASE_TIMEOUT_MS);
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const user = (await response.json())?.users?.[0];
    if (!user?.email || user.emailVerified !== true) return null;
    return String(user.email).trim().toLowerCase();
  } finally {
    clearTimeout(timer);
  }
}

function recent(timestamp) {
  const value = typeof timestamp === 'number' ? timestamp : Date.parse(String(timestamp || ''));
  if (!Number.isFinite(value)) return false;
  const age = Date.now() - value;
  return age >= 0 && age < CACHE_MAX_AGE_MS;
}

async function readR2Object(binding, key) {
  try {
    const object = await binding.get(key);
    if (!object) return { available: true, entry: null };
    const entry = await object.json().catch(() => null);
    return { available: true, entry };
  } catch (error) {
    console.warn(`Non se puido ler a caché de acceso ${key}:`, error);
    return { available: false, entry: null };
  }
}

function adminState(entry, email) {
  const identityMatches = String(entry?.administrador || '').trim().toLowerCase() === email;
  const valid = identityMatches
    && entry?.payload?.perfil?.nivel === 'Administración'
    && recent(Number(entry?.savedAt || 0));

  return {
    known: valid,
    allowed: valid
  };
}

function reviewState(entry, email) {
  const identityMatches = String(entry?.email || '').trim().toLowerCase() === email;
  const valid = identityMatches && recent(entry?.verificadaEn);
  return {
    known: valid && typeof entry?.administrador === 'boolean',
    allowed: valid && entry?.administrador === true
  };
}

export async function onRequestPost({ request, env }) {
  if (!env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'Firebase non está configurado.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude JSON non válida.' });
  }

  let email;
  try {
    email = await verifyFirebase(body?.idToken, env.FIREBASE_API_KEY);
  } catch {
    return json(503, { ok: false, erro: 'Non foi posible validar a sesión.' });
  }

  if (!email) {
    return json(401, { ok: false, erro: 'A sesión non é válida ou caducou.' });
  }
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') {
    return json(503, { ok: false, erro: 'A caché de permisos non está dispoñible.' });
  }

  const started = Date.now();
  const key = await hashEmail(email);
  const [adminResult, reviewResult] = await Promise.all([
    readR2Object(env.R2_PRIVADO, `${ADMIN_CACHE_PREFIX}${key}.json`),
    readR2Object(env.R2_PRIVADO, `${REVIEW_CACHE_PREFIX}${key}.json`)
  ]);

  const administration = adminState(adminResult.entry, email);
  const review = reviewState(reviewResult.entry, email);

  return json(200, {
    ok: true,
    email,
    administrationAllowed: administration.allowed,
    reviewAllowed: review.allowed,
    administrationKnown: adminResult.available && administration.known,
    reviewKnown: reviewResult.available && review.known
  }, {
    'Server-Timing': `r2;dur=${Date.now() - started}`,
    'X-SCPP-Access-Source': adminResult.available && reviewResult.available ? 'R2' : 'R2-PARTIAL'
  });
}
