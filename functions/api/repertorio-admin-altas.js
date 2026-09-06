import { obterJsonAppsScript } from '../_lib/apps-script.js';

const APPS_SCRIPT_PRODUCION = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const APPS_SCRIPT_PREVIEW = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'mp4', 'wav', 'ogg', 'aac', 'flac']);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const clean = (value) => String(value ?? '').trim();

function ramaActual(env) {
  return clean(env.CF_PAGES_BRANCH) === 'main' ? 'main' : 'preview';
}

function appsScriptUrl(env) {
  return ramaActual(env) === 'main' ? APPS_SCRIPT_PRODUCION : APPS_SCRIPT_PREVIEW;
}

function cacheKey(env) {
  return `repertorio/cache/administracion/${ramaActual(env)}/listado-v2.json`;
}

async function verificarFirebase(token, apiKey) {
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
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

async function hashEmail(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function eAdministrador(env, user) {
  const object = await env.R2_PRIVADO?.get?.(`persoas/cache/administracion/${await hashEmail(user.email)}.json`);
  if (!object) return false;
  const data = await object.json().catch(() => null);
  return data?.administrador === user.email && data?.payload?.perfil?.nivel === 'Administración';
}

async function chamarAppsScript(env, user, accion, payload) {
  const { resultado } = await obterJsonAppsScript(env, {
    token: env.WEB_WRITE_TOKEN,
    email: user.email,
    uidFirebase: user.uid,
    accion,
    ...payload
  }, {
    timeoutMs: 30000,
    attemptTimeoutMs: 12000,
    urlOverride: appsScriptUrl(env)
  });
  return resultado;
}

async function lerCache(env) {
  if (!env.R2_PRIVADO?.get) return null;
  const object = await env.R2_PRIVADO.get(cacheKey(env));
  if (!object) return null;
  const cache = await object.json().catch(() => null);
  return cache?.payload?.ok ? cache : null;
}

async function gardarCache(env, cache) {
  if (!env.R2_PRIVADO?.put || !cache?.payload?.ok) return;
  await env.R2_PRIVADO.put(
    cacheKey(env),
    JSON.stringify({ gardadoEn: Date.now(), payload: cache.payload }),
    { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } }
  );
}

async function invalidarCache(env) {
  if (env.R2_PRIVADO?.delete) await env.R2_PRIVADO.delete(cacheKey(env));
}

async function anexarCache(env, tipo, fila) {
  try {
    const cache = await lerCache(env);
    if (!cache) return;
    const campo = tipo === 'obra' ? 'obras' : 'audios';
    if (!Array.isArray(cache.payload[campo])) {
      await invalidarCache(env);
      return;
    }
    cache.payload[campo].push(fila);
    await gardarCache(env, cache);
  } catch {
    await invalidarCache(env).catch(() => {});
  }
}

function bytesDesdeBase64(value) {
  const texto = clean(value).replace(/^data:[^;]+;base64,/i, '');
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let index = 0; index < binario.length; index += 1) bytes[index] = binario.charCodeAt(index);
  return bytes;
}

function nomeFicheiroSeguro(value) {
  const base = clean(value).replace(/\\/g, '/').split('/').pop() || 'audio';
  return base.replace(/[\u0000-\u001f\u007f]+/g, '').replace(/[<>:"|?*]+/g, '-').trim() || 'audio';
}

function extension(value) {
  const match = nomeFicheiroSeguro(value).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function slugFicheiro(value) {
  const nome = nomeFicheiroSeguro(value);
  const ext = extension(nome);
  const stem = ext ? nome.slice(0, -(ext.length + 1)) : nome;
  const slug = stem
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'audio';
  return ext ? `${slug}.${ext}` : slug;
}

function mimeAudioValido(nome, mimeType) {
  const ext = extension(nome);
  const mime = clean(mimeType).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) return false;
  return !mime || mime.startsWith('audio/') || (ext === 'mp4' && mime === 'video/mp4') || mime === 'application/octet-stream';
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function dataSheet(value) {
  const iso = clean(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

async function altaObra(env, user, body) {
  const obra = body?.obra && typeof body.obra === 'object' ? body.obra : {};
  const nome = clean(obra.NomeObra);
  if (!nome) return { ok: false, codigo: 'VALIDATION', erro: 'Indica o nome da obra.' };

  const datos = {
    NomeObra: nome,
    Compositor: clean(obra.Compositor),
    AutorLetra: clean(obra.AutorLetra),
    'Nac/fall': clean(obra['Nac/fall']),
    EstadoObra: clean(obra.EstadoObra) || 'Activa',
    Categoria: clean(obra.Categoria),
    Coleccion: clean(obra.Coleccion),
    OrdeColeccion: clean(obra.OrdeColeccion),
    Partitura: clean(obra.Partitura),
    'Vídeo': clean(obra['Vídeo']),
    'Enlace a vídeo': clean(obra['Enlace a vídeo']),
    Comentarios: clean(obra.Comentarios)
  };

  const resultado = await chamarAppsScript(env, user, 'altaObraRepertorioAdministracion', { obra: datos });
  if (!resultado?.ok) return resultado || { ok: false, erro: 'Non foi posible crear a obra.' };

  const id = clean(resultado.id);
  await anexarCache(env, 'obra', { ...datos, Id: id }).catch(() => {});
  return { ok: true, id };
}

async function altaAudio(env, user, body) {
  if (!env.R2_PRIVADO?.put) {
    return { ok: false, codigo: 'R2_NOT_CONFIGURED', erro: 'O almacén privado R2 non está configurado.' };
  }

  const audio = body?.audio && typeof body.audio === 'object' ? body.audio : {};
  const ficheiro = body?.ficheiro && typeof body.ficheiro === 'object' ? body.ficheiro : {};
  const obra = clean(audio.NomeObra);
  const nome = nomeFicheiroSeguro(ficheiro.nome);
  const mimeType = clean(ficheiro.mimeType).toLowerCase() || 'application/octet-stream';

  if (!obra) return { ok: false, codigo: 'VALIDATION', erro: 'Selecciona a obra relacionada.' };
  if (!clean(ficheiro.base64)) return { ok: false, codigo: 'VALIDATION', erro: 'Selecciona un ficheiro de audio.' };
  if (!mimeAudioValido(nome, mimeType)) {
    return { ok: false, codigo: 'INVALID_AUDIO', erro: 'O formato do ficheiro de audio non está admitido.' };
  }

  let bytes;
  try {
    bytes = bytesDesdeBase64(ficheiro.base64);
  } catch {
    return { ok: false, codigo: 'INVALID_AUDIO', erro: 'Non foi posible ler o ficheiro de audio.' };
  }
  if (!bytes.byteLength) return { ok: false, codigo: 'EMPTY_AUDIO', erro: 'O ficheiro de audio está baleiro.' };
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, codigo: 'AUDIO_TOO_LARGE', erro: 'O ficheiro supera o límite de 40 MB.' };
  }

  const slug = slugFicheiro(nome);
  const r2Key = `repertorio/audios/${obra}/${Date.now()}-${crypto.randomUUID()}-${slug}`;
  const sha256 = await sha256Hex(bytes);
  const agora = new Date().toISOString();
  const r2Object = await env.R2_PRIVADO.put(r2Key, bytes, {
    httpMetadata: { contentType: mimeType, cacheControl: 'private, max-age=3600' },
    customMetadata: { sha256, obra }
  });

  const fila = {
    NomeObra: obra,
    Voz: clean(audio.Voz),
    TipoAudio: clean(audio.TipoAudio) || 'Estudo',
    AudioFile: `Obras_Files_/${nome}`,
    'Observacións': clean(audio['Observacións']),
    DataCarga: dataSheet(audio.DataCarga),
    Activo: 'Y',
    Orde: clean(audio.Orde),
    R2Key: r2Key,
    EstadoR2: 'Verificado',
    DataSubidaR2: agora,
    TamanoR2: bytes.byteLength,
    MimeType: mimeType,
    R2ETag: clean(r2Object?.httpEtag || r2Object?.etag),
    R2SHA256: sha256
  };

  try {
    const resultado = await chamarAppsScript(env, user, 'altaAudioRepertorioAdministracion', { audio: fila });
    if (!resultado?.ok) throw new Error(resultado?.erro || 'Non foi posible crear o rexistro en AudiosRepertorio.');
    const id = clean(resultado.id);
    await anexarCache(env, 'audio', { ...fila, Id_Audio: id }).catch(() => {});
    return { ok: true, id, r2Key, tamano: bytes.byteLength, mimeType, sha256 };
  } catch (error) {
    await env.R2_PRIVADO.delete(r2Key).catch(() => {});
    throw error;
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida.' });
  }

  const user = await verificarFirebase(clean(body.idToken), env.FIREBASE_API_KEY).catch(() => null);
  if (!user) return json(401, { ok: false, erro: 'A sesión non é válida.' });
  if (!(await eAdministrador(env, user))) {
    return json(403, { ok: false, erro: 'Só Administración pode xestionar o repertorio.' });
  }

  const accion = clean(body.accion);
  try {
    if (accion === 'altaObraRepertorioAdministracion') {
      const resultado = await altaObra(env, user, body);
      return json(resultado?.ok ? 200 : 400, resultado);
    }
    if (accion === 'altaAudioRepertorioAdministracion') {
      const resultado = await altaAudio(env, user, body);
      return json(resultado?.ok ? 200 : 400, resultado);
    }
    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    return json(502, {
      ok: false,
      codigo: error?.code || 'REPERTORIO_ADMIN_ALTA_ERROR',
      erro: error instanceof Error ? error.message : 'Non foi posible completar a alta.'
    });
  }
}
