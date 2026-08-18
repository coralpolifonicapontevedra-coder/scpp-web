const TIMEOUT_FIREBASE_MS = 8000;
const PERFIS_R2_KEY = 'persoas/cache/perfis.json';
const PERFIL_R2_PREFIX = 'persoas/cache/perfis/';
const ENSAIOS_CACHE_PREFIX = 'ensaios/cache-v2/usuarios/';

const clean = (v) => String(v == null ? '' : v).trim();
const json = (status, body) => new Response(JSON.stringify(body), { status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'} });

async function fetchLimit(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal:controller.signal }); }
  finally { clearTimeout(timer); }
}

async function verifyFirebase(idToken, apiKey) {
  const token = clean(idToken);
  if (!token) return null;
  const response = await fetchLimit(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken:token}) }, TIMEOUT_FIREBASE_MS);
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid:clean(user.localId), email:clean(user.email).toLowerCase() };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(value).toLowerCase()));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
}

async function readJson(env, key) {
  const obj = await env.R2_PRIVADO.get(key);
  if (!obj) return null;
  try { return await obj.json(); } catch { return null; }
}

const personEmail = (p) => clean(p?.correoElectronico || p?.correo || p?.email).toLowerCase();
const personId = (p) => clean(p?.idPersoa || p?.id || p?.Id || p?.['Row ID']);
function activeSinger(p) {
  const voice = clean(p?.voz || p?.Voz);
  const state = clean(p?.activo ?? p?.Activo ?? p?.estado ?? p?.Estado).toLowerCase();
  return Boolean(voice) && !['baixa','baja','inactivo','inactiva','false','0'].includes(state);
}

async function profileFor(env, email) {
  const individual = await readJson(env, `${PERFIL_R2_PREFIX}${await sha256(email)}.json`);
  if (individual?.payload?.ok && individual.payload.perfil) return individual.payload.perfil;
  const index = await readJson(env, PERFIS_R2_KEY);
  const p = Array.isArray(index?.persoas) ? index.persoas.find(x => personEmail(x) === email) : null;
  return p || null;
}

async function latestSharedPayload(env) {
  let cursor;
  let best = null;
  for (let page = 0; page < 3; page += 1) {
    const listed = await env.R2_PRIVADO.list({ prefix:ENSAIOS_CACHE_PREFIX, cursor, limit:100 });
    for (const object of listed.objects || []) {
      const entry = await readJson(env, object.key);
      if (!entry?.payload?.ok || entry.payload.version !== 2 || !Array.isArray(entry.payload.ensaios)) continue;
      const savedAt = Number(entry.savedAt || 0);
      if (!best || savedAt > best.savedAt) best = { savedAt, payload:entry.payload };
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return best?.payload || null;
}

export async function onRequest({request, env}) {
  if (request.method !== 'POST') return json(405,{ok:false,erro:'Método non permitido.'});
  if (!env.FIREBASE_API_KEY || !env.R2_PRIVADO) return json(500,{ok:false,erro:'O servizo non está configurado.'});
  let body; try { body = await request.json(); } catch { return json(400,{ok:false,erro:'Solicitude non válida.'}); }
  const user = await verifyFirebase(body.idToken, env.FIREBASE_API_KEY).catch(()=>null);
  if (!user) return json(401,{ok:false,erro:'A identificación non é válida ou caducou.'});
  const profile = await profileFor(env, user.email);
  if (!profile || !activeSinger(profile)) return json(403,{ok:false,erro:'Usuario non autorizado para consultar ensaios.'});
  const source = await latestSharedPayload(env);
  if (!source) return json(503,{ok:false,erro:'A información de ensaios aínda non está dispoñible en R2.'});
  return json(200,{
    ok:true, version:2,
    perfil:{ email:user.email, nivel:'Coralista', podeEditar:false, idPersoa:personId(profile), voz:clean(profile?.voz || profile?.Voz) },
    ensaios:Array.isArray(source.ensaios)?source.ensaios:[],
    ensaiosRepertorio:Array.isArray(source.ensaiosRepertorio)?source.ensaiosRepertorio:[],
    repertorio:Array.isArray(source.repertorio)?source.repertorio:[],
    concertos:[], persoas:[], asistencias:[], seguimento:{},
    diagnostico:{fonte:'R2-CORALISTA'}
  });
}
