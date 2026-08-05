import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const TIPOS_FOTO = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FOTO_BYTES = 2 * 1024 * 1024;
const CACHE_FRESCA_MS = 10 * 60 * 1000;
const CACHE_RESPALDO_MS = 30 * 24 * 60 * 60 * 1000;
const PERFIS_R2_KEY = 'persoas/cache/perfis.json';
const PERFIL_R2_PREFIX = 'persoas/cache/perfis/';
const CACHE_TOKEN_MS = 10 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8_000;
const cacheTokens = new Map();
const cachePerfis = new Map();

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function limparMap(cache, maximo) {
  const agora = Date.now();
  for (const [clave, entrada] of cache.entries()) {
    if (!entrada || agora - Number(entrada.savedAt || 0) > CACHE_RESPALDO_MS) {
      cache.delete(clave);
    }
  }
  while (cache.size > maximo) cache.delete(cache.keys().next().value);
}

async function verificarTokenFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token) return null;

  const cacheado = cacheTokens.get(token);
  if (cacheado && cacheado.expira > Date.now()) return cacheado.usuario;

  const resposta = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    TIMEOUT_FIREBASE_MS
  );

  if (!resposta.ok) return null;
  const usuarioFirebase = (await resposta.json())?.users?.[0];
  if (!usuarioFirebase?.email || usuarioFirebase.emailVerified !== true) return null;

  const usuario = {
    uid: String(usuarioFirebase.localId || ''),
    email: String(usuarioFirebase.email).trim().toLowerCase()
  };
  cacheTokens.set(token, {
    usuario,
    expira: Date.now() + CACHE_TOKEN_MS,
    savedAt: Date.now()
  });
  limparMap(cacheTokens, 100);
  return usuario;
}

const texto = (valor, maximo = 5000) =>
  String(valor == null ? '' : valor).trim().slice(0, maximo);

function cacheRequest(request, email) {
  const url = new URL(request.url);
  url.pathname = '/api/_cache/perfil';
  url.search = `usuario=${encodeURIComponent(email)}&version=1`;
  return new Request(url.toString(), { method: 'GET' });
}

async function lerCache(request, email) {
  const memoria = cachePerfis.get(email);
  if (memoria && Date.now() - memoria.savedAt <= CACHE_RESPALDO_MS) return memoria;

  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return null;

  try {
    const response = await cacheApi.match(cacheRequest(request, email));
    if (!response) return null;
    const entrada = await response.json();
    if (!entrada?.payload?.ok || !entrada.payload.perfil) return null;
    if (Date.now() - Number(entrada.savedAt || 0) > CACHE_RESPALDO_MS) return null;
    cachePerfis.set(email, entrada);
    limparMap(cachePerfis, 100);
    return entrada;
  } catch (error) {
    console.warn('Non se puido ler a cache do perfil:', error);
    return null;
  }
}

async function gardarCache(request, email, payload) {
  if (!payload?.ok || !payload.perfil) return;

  const entrada = { savedAt: Date.now(), payload };
  cachePerfis.set(email, entrada);
  limparMap(cachePerfis, 100);

  const cacheApi = globalThis.caches?.default;
  if (!cacheApi) return;

  try {
    await cacheApi.put(
      cacheRequest(request, email),
      new Response(JSON.stringify(entrada), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${Math.floor(CACHE_RESPALDO_MS / 1000)}`
        }
      })
    );
  } catch (error) {
    console.warn('Non se puido gardar a cache do perfil:', error);
  }
}

async function identificadorCache(valor) {
  const bytes = new TextEncoder().encode(String(valor || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function perfilDesdePersoa(persoa) {
  if (!persoa || typeof persoa !== 'object') return null;
  return {
    ...persoa,
    nomeCompleto: persoa.nomeCompleto || [persoa.nome, persoa.primeiroApelido, persoa.segundoApelido].filter(Boolean).join(' '),
    dataIncorporacionSCPP: persoa.dataIncorporacionSCPP || persoa.dataIncorporacion || '',
    correoElectronico: persoa.correoElectronico || persoa.correo || persoa.email || ''
  };
}

function correoPersoa(persoa) {
  return String(
    persoa?.correoElectronico || persoa?.correo || persoa?.email || ''
  ).trim().toLowerCase();
}

async function lerJsonR2(env, key) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(key);
  if (!object) return null;
  try {
    return await object.json();
  } catch (error) {
    console.warn(`Non se puido ler ${key} desde R2:`, error);
    return null;
  }
}

async function lerPerfilR2(env, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const id = await identificadorCache(normalizedEmail);
    const individual = await lerJsonR2(env, `${PERFIL_R2_PREFIX}${id}.json`);
    if (
      individual?.payload?.ok &&
      individual.payload.perfil &&
      Date.now() - Number(individual.savedAt || 0) <= CACHE_RESPALDO_MS
    ) {
      return individual;
    }

    const indice = await lerJsonR2(env, PERFIS_R2_KEY);
    if (
      !Array.isArray(indice?.persoas) ||
      Date.now() - Number(indice.savedAt || 0) > CACHE_RESPALDO_MS
    ) {
      return null;
    }
    const persoa = indice.persoas.find((item) => correoPersoa(item) === normalizedEmail);
    const perfil = perfilDesdePersoa(persoa);
    return perfil ? { savedAt: Number(indice.savedAt || Date.now()), payload: { ok: true, perfil } } : null;
  } catch (error) {
    console.warn('Non se puido ler o respaldo do perfil desde R2:', error);
    return null;
  }
}

async function gardarPerfilR2(env, email, payload) {
  if (
    !payload?.ok ||
    !payload.perfil ||
    !env.R2_PRIVADO ||
    typeof env.R2_PRIVADO.put !== 'function'
  ) {
    return;
  }

  try {
    const id = await identificadorCache(email);
    await env.R2_PRIVADO.put(
      `${PERFIL_R2_PREFIX}${id}.json`,
      JSON.stringify({ savedAt: Date.now(), payload }),
      {
        httpMetadata: {
          contentType: 'application/json; charset=utf-8',
          cacheControl: 'private, no-store'
        }
      }
    );
  } catch (error) {
    console.warn('Non se puido gardar o respaldo do perfil en R2:', error);
  }
}

async function consultarPerfil(env, corpo) {
  return obterJsonAppsScript(env, corpo, {
    timeoutMs: 15_000,
    attemptTimeoutMs: 7_000
  });
}

async function actualizarCache(context, corpo, email) {
  try {
    const { resultado } = await consultarPerfil(context.env, corpo);
    if (resultado?.ok) {
      await Promise.all([
        gardarCache(context.request, email, resultado),
        gardarPerfilR2(context.env, email, resultado)
      ]);
    }
  } catch (error) {
    console.warn('Non se puido actualizar a cache do perfil:', error);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const inicioTotal = Date.now();

  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  const idToken = texto(datos.idToken, 10000);
  const inicioFirebase = Date.now();
  let usuario;
  try {
    usuario = await verificarTokenFirebase(idToken, env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro ao validar Firebase:', erro);
  }
  const duracionFirebase = Date.now() - inicioFirebase;

  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  const accion = texto(datos.accion || 'obterPerfil', 40);
  if (!new Set(['obterPerfil', 'actualizarPerfil']).has(accion)) {
    return json(400, { ok: false, erro: 'Acción non permitida' });
  }

  const fotoBase64 = texto(datos.fotoBase64, 4 * 1024 * 1024);
  const fotoTipo = texto(datos.fotoTipo, 80).toLowerCase();

  if (accion === 'actualizarPerfil' && fotoBase64) {
    if (!TIPOS_FOTO.has(fotoTipo)) {
      return json(400, { ok: false, erro: 'O formato da fotografía non é compatible' });
    }
    if (Math.floor((fotoBase64.length * 3) / 4) > MAX_FOTO_BYTES) {
      return json(413, { ok: false, erro: 'A fotografía de perfil supera o máximo permitido' });
    }
  }

  const corpo = {
    token: env.WEB_WRITE_TOKEN,
    accion,
    email: usuario.email,
    uidFirebase: usuario.uid
  };

  if (accion === 'actualizarPerfil') {
    Object.assign(corpo, {
      telefono: texto(datos.telefono, 40),
      correoElectronico: texto(datos.correoElectronico, 160),
      enderezo: texto(datos.enderezo, 240),
      cidade: texto(datos.cidade, 120),
      cp: texto(datos.cp, 10),
      dataNacemento: texto(datos.dataNacemento, 20),
      contactoEmerxencia: texto(datos.contactoEmerxencia, 180),
      telefonoEmerxencia: texto(datos.telefonoEmerxencia, 40),
      preferenciaComunicacion: texto(datos.preferenciaComunicacion, 60),
      consentimentoFoto: texto(datos.consentimentoFoto, 80),
      mostrarAniversario: datos.mostrarAniversario === true,
      fotoBase64,
      fotoTipo,
      fotoNome: texto(datos.fotoNome, 160)
    });
  }

  if (accion === 'obterPerfil') {
    const cacheada = await lerCache(request, usuario.email);
    if (cacheada) {
      const idade = Date.now() - cacheada.savedAt;
      if (idade >= CACHE_FRESCA_MS && typeof context.waitUntil === 'function') {
        context.waitUntil(actualizarCache(context, corpo, usuario.email));
      }
      return json(200, cacheada.payload, {
        'X-SCPP-Cache': idade < CACHE_FRESCA_MS ? 'HIT' : 'STALE-WHILE-REVALIDATE',
        'X-SCPP-Data-Age': String(Math.max(0, Math.floor(idade / 1000))),
        'Server-Timing': `firebase;dur=${duracionFirebase}, cache;dur=0, total;dur=${Date.now() - inicioTotal}`
      });
    }

    const respaldoR2 = await lerPerfilR2(env, usuario.email);
    if (respaldoR2?.payload?.perfil) {
      await gardarCache(request, usuario.email, respaldoR2.payload);
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(actualizarCache(context, corpo, usuario.email));
      }
      return json(200, respaldoR2.payload, {
        'X-SCPP-Cache': 'R2',
        'X-SCPP-Data-Age': String(Math.max(0, Math.floor((Date.now() - respaldoR2.savedAt) / 1000))),
        'Server-Timing': `firebase;dur=${duracionFirebase}, r2;dur=0, total;dur=${Date.now() - inicioTotal}`
      });
    }
  }

  const inicioAppsScript = Date.now();
  try {
    const { resultado, usouRespaldo } = accion === 'obterPerfil'
      ? await consultarPerfil(env, corpo)
      : await obterJsonAppsScript(env, corpo, {
          timeoutMs: 60_000,
          attemptTimeoutMs: 20_000
        });
    const duracionAppsScript = Date.now() - inicioAppsScript;

    if (!resultado?.ok) {
      const estado = resultado?.erro === 'Usuario non autorizado' ? 403 : 400;
      return json(estado, {
        ok: false,
        erro: resultado?.erro || 'Non foi posible completar a operación do perfil.'
      });
    }

    await Promise.all([
      gardarCache(request, usuario.email, resultado),
      gardarPerfilR2(env, usuario.email, resultado)
    ]);

    return json(200, resultado, {
      'X-SCPP-AppScript': usouRespaldo ? 'FALLBACK' : 'PRIMARY',
      'X-SCPP-Cache': 'MISS',
      'Server-Timing': `firebase;dur=${duracionFirebase}, apps-script;dur=${duracionAppsScript}, total;dur=${Date.now() - inicioTotal}`
    });
  } catch (erro) {
    console.error('Erro no servizo de perfil:', erro);
    const cacheEmerxencia = await lerCache(request, usuario.email);
    if (accion === 'obterPerfil' && cacheEmerxencia?.payload?.perfil) {
      return json(200, cacheEmerxencia.payload, {
        'X-SCPP-Cache': 'EMERGENCY',
        'X-SCPP-Warning': 'apps-script-unavailable',
        'Server-Timing': `firebase;dur=${duracionFirebase}, total;dur=${Date.now() - inicioTotal}`
      });
    }

    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: 'O servizo de perfil non está dispoñible neste momento. Tenta de novo nuns segundos.'
    });
  }
}
