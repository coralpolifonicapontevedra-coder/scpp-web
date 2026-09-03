const TOKEN_PREFIX = 'persoas/revisions/';
const ACCEPTANCE_PREFIX = 'persoas/aceptacions/';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_FIREBASE_MS = 8000;
const TIMEOUT_APPS_SCRIPT_MS = 15000;
const LEGAL_ID = 'DATOS_PERSOA_SCPP';
const LEGAL_CACHE_KEY = 'persoas/textos-legais/DATOS_PERSOA_SCPP.json';
const LEGAL_CACHE_TTL_MS = 30 * 60 * 1000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
});

async function fetchConLimite(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verificarFirebase(idToken, apiKey) {
  const token = String(idToken || '').trim();
  if (!token || !apiKey) return null;
  const response = await fetchConLimite(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    },
    TIMEOUT_FIREBASE_MS
  );
  if (!response.ok) return null;
  const user = (await response.json())?.users?.[0];
  if (!user?.email || user.emailVerified !== true) return null;
  return { uid: String(user.localId || ''), email: String(user.email).trim().toLowerCase() };
}

function urlAppsScriptPrincipal(env) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(url) ? url : '';
}

async function chamarAppsScript(env, body) {
  const url = urlAppsScriptPrincipal(env);
  if (!url || !env.WEB_WRITE_TOKEN) throw new Error('Apps Script non está configurado.');
  const response = await fetchConLimite(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: env.WEB_WRITE_TOKEN, ...body })
  }, TIMEOUT_APPS_SCRIPT_MS);
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('Apps Script devolveu unha resposta non válida.'); }
  if (!response.ok || !result?.ok) throw new Error(result?.erro || `Apps Script respondeu HTTP ${response.status}.`);
  return result;
}

function tokenValido(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{40,160}$/.test(token) ? token : '';
}

function crearToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function keyToken(token) { return `${TOKEN_PREFIX}${token}.json`; }
function safeId(value) { return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120); }
function keyAcceptanceIndex(idPersoa) { return `${ACCEPTANCE_PREFIX}${safeId(idPersoa)}/latest.json`; }
function keyAcceptancePdf(idPersoa, revisionId) { return `${ACCEPTANCE_PREFIX}${safeId(idPersoa)}/aceptacion-${safeId(revisionId)}.pdf`; }

function personKey(item) {
  return String(item?.idPersoa || item?.id || item?.rowId || '').trim();
}

function snapshotPublico(item) {
  return {
    idPersoa: personKey(item),
    nomeCompleto: String(item?.nomeCompleto || '').trim(),
    nome: String(item?.nome || '').trim(),
    primeiroApelido: String(item?.primeiroApelido || '').trim(),
    segundoApelido: String(item?.segundoApelido || '').trim(),
    nif: String(item?.nif || '').trim(),
    dataNacemento: String(item?.dataNacemento || '').trim(),
    telefono: String(item?.telefono || '').trim(),
    correo: String(item?.correo || '').trim(),
    enderezo: String(item?.enderezo || '').trim(),
    cidade: String(item?.cidade || '').trim(),
    cp: String(item?.cp || '').trim(),
    contactoEmerxencia: String(item?.contactoEmerxencia || '').trim(),
    telefonoEmerxencia: String(item?.telefonoEmerxencia || '').trim(),
    preferenciaComunicacion: String(item?.preferenciaComunicacion || '').trim(),
    consentimentoFoto: String(item?.consentimentoFoto || '').trim(),
    mostrarAniversario: item?.mostrarAniversario === true,
    voz: String(item?.voz || '').trim(),
    tipoSocio: String(item?.tipoSocio || '').trim(),
    cargo: String(item?.cargo || '').trim(),
    dataIncorporacion: String(item?.dataIncorporacion || '').trim()
  };
}

function limparTexto(value, max = 240) { return String(value ?? '').trim().slice(0, max); }

function limparDatosPersoais(input) {
  const data = input && typeof input === 'object' ? input : {};
  const correo = limparTexto(data.correo, 160).toLowerCase();
  const cp = limparTexto(data.cp, 10);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('O correo electrónico non é válido.');
  if (cp && !/^\d{5}$/.test(cp)) throw new Error('O código postal debe ter cinco cifras.');
  return {
    nome: limparTexto(data.nome, 100),
    primeiroApelido: limparTexto(data.primeiroApelido, 120),
    segundoApelido: limparTexto(data.segundoApelido, 120),
    nif: limparTexto(data.nif, 30),
    dataNacemento: limparTexto(data.dataNacemento, 20),
    telefono: limparTexto(data.telefono, 40),
    correo,
    enderezo: limparTexto(data.enderezo, 240),
    cidade: limparTexto(data.cidade, 120),
    cp,
    contactoEmerxencia: limparTexto(data.contactoEmerxencia, 180),
    telefonoEmerxencia: limparTexto(data.telefonoEmerxencia, 40),
    preferenciaComunicacion: limparTexto(data.preferenciaComunicacion, 80),
    consentimentoFoto: limparTexto(data.consentimentoFoto, 80),
    mostrarAniversario: data.mostrarAniversario === true
  };
}

function textoLegalValido(value) {
  const legal = value && typeof value === 'object' ? value : null;
  if (!legal) return null;
  const id = String(legal.id || '').trim();
  const version = String(legal.version || '').trim();
  const titulo = String(legal.titulo || '').trim();
  const texto = String(legal.texto || '').trim();
  const ambito = String(legal.ambito || '').trim();
  const dataVixencia = String(legal.dataVixencia || '').trim();
  if (id !== LEGAL_ID || !version || !titulo || !texto) return null;
  return { id, version, titulo, texto, ambito, dataVixencia };
}

async function lerTextoLegalCache(env) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  try {
    const object = await env.R2_PRIVADO.get(LEGAL_CACHE_KEY);
    if (!object) return null;
    const cache = await object.json();
    const gardadoEn = Date.parse(String(cache?.gardadoEn || ''));
    if (!Number.isFinite(gardadoEn) || Date.now() - gardadoEn > LEGAL_CACHE_TTL_MS) return null;
    return textoLegalValido(cache?.textoLegal);
  } catch (error) {
    console.warn('Non se puido ler a caché do texto legal de Persoas:', error);
    return null;
  }
}

async function gardarTextoLegalCache(env, textoLegal) {
  const legal = textoLegalValido(textoLegal);
  if (!legal || !env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return;
  try {
    await env.R2_PRIVADO.put(
      LEGAL_CACHE_KEY,
      JSON.stringify({ gardadoEn: new Date().toISOString(), textoLegal: legal }),
      { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' } }
    );
  } catch (error) {
    console.warn('Non se puido gardar a caché do texto legal de Persoas:', error);
  }
}

async function obterTextoLegalPersoas(env, user) {
  const cache = await lerTextoLegalCache(env);
  if (cache) return cache;

  const listado = await chamarAppsScript(env, {
    accion: 'listarPersoasAdministracion',
    email: user.email,
    uidFirebase: user.uid,
    incluirTextoLegalPersoas: true
  });
  if (listado?.perfil?.nivel !== 'Administración') throw new Error('Non tes permiso de Administración.');
  const textoLegal = textoLegalValido(listado?.textoLegalPersoas);
  if (!textoLegal) throw new Error('O texto legal específico de Persoas non está dispoñible.');
  await gardarTextoLegalCache(env, textoLegal);
  return textoLegal;
}

async function lerInvitacion(env, token) {
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.get !== 'function') return null;
  const object = await env.R2_PRIVADO.get(keyToken(token));
  if (!object) return null;
  const invitation = await object.json();
  if (!invitation || invitation.token !== token) return null;
  return invitation;
}

async function verificarAdministrador(context, data) {
  const { env } = context;
  const user = await verificarFirebase(data.idToken, env.FIREBASE_API_KEY);
  if (!user) throw Object.assign(new Error('A sesión administrativa non é válida.'), { status: 401 });

  const listUrl = new URL('/api/persoas-v2', context.request.url);
  const listResponse = await fetch(listUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: data.idToken, accion: 'listarPersoasAdministracion' })
  });
  const listado = await listResponse.json().catch(() => null);
  if (!listResponse.ok || listado?.ok !== true) {
    const status = listResponse.status === 401 || listResponse.status === 403 ? listResponse.status : 503;
    throw Object.assign(new Error(listado?.erro || 'Non foi posible cargar as persoas.'), { status });
  }
  if (listado?.perfil?.nivel !== 'Administración') {
    throw Object.assign(new Error('Non tes permiso de Administración.'), { status: 403 });
  }
  return { user, listado };
}

function buscarPersoa(listado, referencia) {
  const ref = String(referencia || '').trim();
  return (Array.isArray(listado?.persoas) ? listado.persoas : []).find((item) =>
    [item?.idPersoa, item?.id, item?.rowId].some((value) => String(value || '').trim() === ref));
}

async function xerarLigazon(context, data) {
  const { env, request } = context;
  let authData;
  try { authData = await verificarAdministrador(context, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error.message }); }

  const persoa = buscarPersoa(authData.listado, data.idPersoa);
  if (!persoa) return json(404, { ok: false, erro: 'Non se atopou a persoa.' });
  if (persoa.activo !== true) return json(400, { ok: false, erro: 'Non se xera revisión para unha persoa en baixa.' });

  let textoLegal;
  try { textoLegal = await obterTextoLegalPersoas(env, authData.user); }
  catch (error) { return json(503, { ok: false, erro: error instanceof Error ? error.message : 'O texto legal específico de Persoas non está dispoñible.' }); }
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return json(503, { ok: false, erro: 'R2 privado non está dispoñible.' });

  const token = crearToken();
  const now = Date.now();
  const invitation = {
    version: 2,
    revisionId: crypto.randomUUID(),
    token,
    estado: 'PENDENTE',
    idPersoa: personKey(persoa),
    administrador: authData.user.email,
    creadaEn: new Date(now).toISOString(),
    caducaEn: new Date(now + TOKEN_TTL_MS).toISOString(),
    persoa: snapshotPublico(persoa),
    textoLegal
  };
  await env.R2_PRIVADO.put(keyToken(token), JSON.stringify(invitation), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });

  const url = new URL(request.url);
  const ligazon = `${url.origin}/revision-datos/?token=${encodeURIComponent(token)}`;
  return json(200, {
    ok: true,
    ligazon,
    caducaEn: invitation.caducaEn,
    persoa: invitation.persoa.nomeCompleto || invitation.idPersoa,
    textoLegal: { id: textoLegal.id, version: textoLegal.version, titulo: textoLegal.titulo },
    envioAutomatico: false
  });
}

async function consultarLigazon(context, token) {
  const invitation = await lerInvitacion(context.env, token);
  if (!invitation) return json(404, { ok: false, erro: 'A ligazón non existe ou xa non está dispoñible.' });
  if (invitation.estado !== 'PENDENTE') return json(410, { ok: false, erro: 'Esta revisión xa foi completada.' });
  if (Date.parse(invitation.caducaEn) <= Date.now()) return json(410, { ok: false, erro: 'A ligazón de revisión caducou.' });
  const textoLegal = textoLegalValido(invitation.textoLegal);
  if (!textoLegal) return json(503, { ok: false, erro: 'A revisión non contén un texto legal válido.' });
  return json(200, { ok: true, persoa: invitation.persoa, textoLegal, caducaEn: invitation.caducaEn });
}

function cp1252Byte(char) {
  const code = char.codePointAt(0);
  if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) return code;
  const map = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f
  };
  return map[code] ?? 0x3f;
}

function pdfHex(value) {
  let out = '';
  for (const char of String(value ?? '').normalize('NFC')) out += cp1252Byte(char).toString(16).padStart(2, '0').toUpperCase();
  return out;
}

function wrapText(value, maxChars) {
  const source = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!source) return [''];
  const words = source.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) { current = word; continue; }
    if ((current + ' ' + word).length <= maxChars) current += ' ' + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

function formatMadrid(iso) {
  try {
    return new Intl.DateTimeFormat('gl-ES', {
      timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(iso));
  } catch { return String(iso || ''); }
}

function crearPdfAceptacion({ invitation, persoa, completadaEn, documento }) {
  const items = [];
  const add = (text, options = {}) => items.push({ text: String(text ?? ''), size: options.size || 10, bold: options.bold === true, after: options.after ?? 2 });
  const addWrapped = (text, options = {}) => {
    const size = options.size || 10;
    const maxChars = options.maxChars || Math.max(50, Math.floor(92 * 10 / size));
    for (const line of wrapText(text, maxChars)) add(line, options);
  };
  const addBlank = (space = 8) => items.push({ blank: true, space });
  const field = (label, value) => addWrapped(`${label}: ${String(value ?? '').trim() || 'Sen indicar'}`, { size: 10 });

  add('SOCIEDADE CORAL POLIFÓNICA DE PONTEVEDRA', { size: 11, bold: true, after: 7 });
  add('Documento individual de aceptación e confirmación de datos', { size: 16, bold: true, after: 10 });
  field('Identificador da persoa', invitation.idPersoa);
  field('Identificador da revisión', invitation.revisionId);
  field('Data e hora da aceptación', `${formatMadrid(completadaEn)} (Europe/Madrid)`);
  field('Versión do texto legal', invitation.textoLegal.version);
  field('Documento R2', documento);
  addBlank(10);

  add('DATOS CONFIRMADOS POLA PERSOA', { size: 12, bold: true, after: 6 });
  field('Nome', persoa.nome);
  field('Primeiro apelido', persoa.primeiroApelido);
  field('Segundo apelido', persoa.segundoApelido);
  field('NIF', persoa.nif);
  field('Data de nacemento', persoa.dataNacemento);
  field('Teléfono', persoa.telefono);
  field('Correo electrónico', persoa.correo);
  field('Enderezo', persoa.enderezo);
  field('Cidade', persoa.cidade);
  field('Código postal', persoa.cp);
  field('Contacto de emerxencia', persoa.contactoEmerxencia);
  field('Teléfono de emerxencia', persoa.telefonoEmerxencia);
  field('Preferencia de comunicación', persoa.preferenciaComunicacion);
  field('Consentimento de fotografía', persoa.consentimentoFoto);
  field('Mostrar aniversario', persoa.mostrarAniversario ? 'Si' : 'Non');
  field('Voz', invitation.persoa.voz);
  field('Tipo de socio', invitation.persoa.tipoSocio);
  field('Cargo', invitation.persoa.cargo);
  field('Data de incorporación', invitation.persoa.dataIncorporacion);
  addBlank(10);

  add(invitation.textoLegal.titulo.toUpperCase(), { size: 12, bold: true, after: 3 });
  add(`Versión ${invitation.textoLegal.version} · Ámbito: ${invitation.textoLegal.ambito || 'Persoas'}`, { size: 9, after: 8 });
  for (const paragraph of String(invitation.textoLegal.texto || '').split(/\n\s*\n/)) {
    addWrapped(paragraph, { size: 9, maxChars: 98, after: 2 });
    addBlank(5);
  }

  add('DECLARACIÓN DE ACEPTACIÓN', { size: 12, bold: true, after: 6 });
  addWrapped('A persoa declara que revisou os datos anteriores e que son correctos coas modificacións introducidas. Declara igualmente que leu e comprendeu o texto legal reproducido neste documento e acepta o tratamento dos seus datos persoais para a xestión da súa relación coa Sociedade Coral Polifónica de Pontevedra e para o cumprimento dos fins propios da entidade.', { size: 10, maxChars: 90, after: 4 });
  addWrapped('Esta aceptación foi realizada mediante unha ligazón individual de revisión e queda asociada á versión exacta do texto legal indicada neste documento.', { size: 10, maxChars: 90, after: 4 });

  const pages = [[]];
  let y = 790;
  for (const item of items) {
    if (item.blank) { y -= item.space; continue; }
    const lineHeight = Math.max(12, item.size * 1.32);
    if (y - lineHeight < 58) { pages.push([]); y = 790; }
    pages[pages.length - 1].push({ ...item, y });
    y -= lineHeight + item.after;
  }

  const objects = {};
  const pageRefs = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  pages.forEach((page, index) => {
    const pageObj = 5 + index * 2;
    const contentObj = pageObj + 1;
    pageRefs.push(`${pageObj} 0 R`);
    let content = 'BT\n';
    for (const line of page) {
      const font = line.bold ? 'F2' : 'F1';
      content += `/${font} ${line.size} Tf\n1 0 0 1 50 ${line.y.toFixed(2)} Tm\n<${pdfHex(line.text)}> Tj\n`;
    }
    content += `/F1 8 Tf\n1 0 0 1 50 30 Tm\n<${pdfHex(`SCPP · aceptación ${invitation.revisionId} · páxina ${index + 1} de ${pages.length}`)}> Tj\nET`;
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`;

  const maxObj = 4 + pages.length * 2;
  const offsets = new Array(maxObj + 1).fill(0);
  let pdf = '%PDF-1.4\n% SCPP acceptance evidence\n';
  for (let i = 1; i <= maxObj; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxObj; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

async function gardarRevision(context, data, token) {
  const { env } = context;
  const invitation = await lerInvitacion(env, token);
  if (!invitation) return json(404, { ok: false, erro: 'A ligazón non existe ou xa non está dispoñible.' });
  if (invitation.estado !== 'PENDENTE') return json(410, { ok: false, erro: 'Esta revisión xa foi completada.' });
  if (Date.parse(invitation.caducaEn) <= Date.now()) return json(410, { ok: false, erro: 'A ligazón de revisión caducou.' });
  if (data.confirmaDatos !== true) return json(400, { ok: false, erro: 'É necesario confirmar que os datos foron revisados.' });
  if (data.aceptaLegal !== true) return json(400, { ok: false, erro: 'É necesario aceptar expresamente o texto legal.' });
  if (!textoLegalValido(invitation.textoLegal)) return json(503, { ok: false, erro: 'O texto legal da revisión non é válido.' });

  let persoa;
  try { persoa = limparDatosPersoais(data.persoa); } catch (error) { return json(400, { ok: false, erro: error.message }); }
  if (!persoa.nome || !persoa.primeiroApelido) return json(400, { ok: false, erro: 'Nome e primeiro apelido son obrigatorios.' });
  if (!env.R2_PRIVADO || typeof env.R2_PRIVADO.put !== 'function') return json(503, { ok: false, erro: 'R2 privado non está dispoñible.' });

  const completadaEn = new Date().toISOString();
  const documento = keyAcceptancePdf(invitation.idPersoa, invitation.revisionId);
  const pdf = crearPdfAceptacion({ invitation, persoa, completadaEn, documento });
  await env.R2_PRIVADO.put(documento, pdf, {
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
    customMetadata: { idPersoa: invitation.idPersoa, revisionId: invitation.revisionId, versionLegal: invitation.textoLegal.version }
  });

  let result;
  try {
    result = await chamarAppsScript(env, {
      accion: 'actualizarPersoaAdministracion',
      email: invitation.administrador,
      idPersoa: invitation.idPersoa,
      id: invitation.idPersoa,
      persoa,
      aceptacion: {
        idTextoLegal: invitation.textoLegal.id,
        version: invitation.textoLegal.version,
        aceptaFines: true,
        documento,
        revisionId: invitation.revisionId,
        xeradaPor: invitation.administrador
      }
    });
    if (!result?.aceptacion?.rowId) throw new Error('O backend non confirmou o rexistro na táboa Aceptación.');
  } catch (error) {
    try { if (typeof env.R2_PRIVADO.delete === 'function') await env.R2_PRIVADO.delete(documento); } catch {}
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible rexistrar a aceptación.' });
  }

  const latest = {
    idPersoa: invitation.idPersoa,
    revisionId: invitation.revisionId,
    documento,
    completadaEn,
    versionLegal: invitation.textoLegal.version,
    tituloLegal: invitation.textoLegal.titulo,
    aceptacionRowId: result.aceptacion.rowId,
    nomeFicheiro: `aceptacion-${safeId(invitation.idPersoa)}-${safeId(invitation.revisionId)}.pdf`
  };
  await env.R2_PRIVADO.put(keyAcceptanceIndex(invitation.idPersoa), JSON.stringify(latest), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });

  invitation.estado = 'COMPLETADA';
  invitation.completadaEn = completadaEn;
  invitation.persoaConfirmada = persoa;
  invitation.aceptacion = latest;
  await env.R2_PRIVADO.put(keyToken(token), JSON.stringify(invitation), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' }
  });
  return json(200, {
    ok: true,
    mensaxe: 'Os datos e a aceptación legal quedaron rexistrados correctamente.',
    versionLegal: invitation.textoLegal.version,
    aceptacionId: result.aceptacion.rowId
  });
}

async function estadoAceptacion(context, data) {
  let authData;
  try { authData = await verificarAdministrador(context, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error.message }); }
  const persoa = buscarPersoa(authData.listado, data.idPersoa);
  if (!persoa) return json(404, { ok: false, erro: 'Non se atopou a persoa.' });
  const object = await context.env.R2_PRIVADO?.get?.(keyAcceptanceIndex(personKey(persoa)));
  if (!object) return json(200, { ok: true, disponible: false });
  const meta = await object.json();
  return json(200, { ok: true, disponible: true, aceptacion: meta });
}

async function obterAceptacion(context, data) {
  let authData;
  try { authData = await verificarAdministrador(context, data); }
  catch (error) { return json(error.status || 503, { ok: false, erro: error.message }); }
  const persoa = buscarPersoa(authData.listado, data.idPersoa);
  if (!persoa) return json(404, { ok: false, erro: 'Non se atopou a persoa.' });
  const indexObject = await context.env.R2_PRIVADO?.get?.(keyAcceptanceIndex(personKey(persoa)));
  if (!indexObject) return json(404, { ok: false, erro: 'Esta persoa aínda non ten unha aceptación electrónica dispoñible.' });
  const meta = await indexObject.json();
  const pdf = await context.env.R2_PRIVADO.get(String(meta.documento || ''));
  if (!pdf) return json(404, { ok: false, erro: 'O PDF de aceptación non está dispoñible en R2.' });
  const headers = new Headers();
  pdf.writeHttpMetadata?.(headers);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Disposition', `inline; filename="${String(meta.nomeFicheiro || 'aceptacion.pdf').replace(/["\\]/g, '')}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(pdf.body, { status: 200, headers });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.WEB_WRITE_TOKEN || !env.FIREBASE_API_KEY) return json(500, { ok: false, erro: 'Falta configuración do servizo.' });

  if (request.method === 'GET') {
    const token = tokenValido(new URL(request.url).searchParams.get('token'));
    if (!token) return json(400, { ok: false, erro: 'Falta unha ligazón de revisión válida.' });
    try { return await consultarLigazon(context, token); }
    catch (error) { return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible consultar a revisión.' }); }
  }

  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido.' });
  let data;
  try { data = await request.json(); } catch { return json(400, { ok: false, erro: 'Solicitude JSON non válida.' }); }

  try {
    const accion = String(data.accion || '');
    if (accion === 'xerarLigazon') return await xerarLigazon(context, data);
    if (accion === 'estadoAceptacion') return await estadoAceptacion(context, data);
    if (accion === 'obterAceptacion') return await obterAceptacion(context, data);
    const token = tokenValido(data.token);
    if (!token) return json(400, { ok: false, erro: 'Falta unha ligazón de revisión válida.' });
    if (accion === 'gardarRevision') return await gardarRevision(context, data, token);
    return json(400, { ok: false, erro: 'Acción non permitida.' });
  } catch (error) {
    return json(503, { ok: false, erro: error instanceof Error ? error.message : 'Non foi posible completar a operación.' });
  }
}
