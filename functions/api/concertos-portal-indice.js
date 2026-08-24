const INDEX_KEY_MAIN = 'indices/concertos-privado-v1.json';
const INDEX_KEY_PREVIEW = 'indices/preview/concertos-privado-v1.json';
const REPERTORIO_CATALOGO_KEY = 'repertorio/cache/catalogo.json';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }
});

const clean = (value = '') => String(value || '').trim();
const normalizarEstado = (value = '') => clean(value).toLowerCase();
const rama = (env) => clean(env.CF_PAGES_BRANCH || 'preview').replace(/[^a-zA-Z0-9._-]/g, '-') || 'preview';
const indiceKey = (env) => rama(env) === 'main' ? INDEX_KEY_MAIN : INDEX_KEY_PREVIEW;

function normalizarTexto(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dataCanon(value = '') {
  const texto = clean(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const partes = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!partes) return '';
  return `${partes[3]}-${String(partes[2]).padStart(2, '0')}-${String(partes[1]).padStart(2, '0')}`;
}

function idObraCatalogo(obra = {}) {
  return clean(
    obra?.id ||
    obra?.Id_Repertorio ||
    obra?.idRepertorio ||
    obra?.ID_Repertorio ||
    obra?.IdRepertorio ||
    obra?.codigo ||
    obra?.Codigo
  );
}

function nomeObraCatalogo(obra = {}) {
  return clean(obra?.nomeObra || obra?.nome || obra?.obra || obra?.titulo || obra?.Título);
}

function autorObraCatalogo(obra = {}) {
  return clean(obra?.compositor || obra?.autor || obra?.Autor || obra?.autorLetra);
}

async function lerCatalogoRepertorio(env) {
  if (!env.R2_PRIVADO?.get) return [];
  try {
    const obxecto = await env.R2_PRIVADO.get(REPERTORIO_CATALOGO_KEY);
    if (!obxecto) return [];
    const datos = await obxecto.json().catch(() => null);
    const obras = Array.isArray(datos?.obras) ? datos.obras : [];
    return obras
      .map((obra) => ({
        id: idObraCatalogo(obra),
        nome: nomeObraCatalogo(obra),
        autor: autorObraCatalogo(obra)
      }))
      .filter((obra) => obra.id && obra.nome);
  } catch (erro) {
    console.warn('Non se puido ler o catálogo R2 de Repertorio para enlazar Concertos:', erro);
    return [];
  }
}

function idProgramaDirecto(item = {}) {
  return clean(
    item?.id ||
    item?.idRepertorio ||
    item?.obraId ||
    item?.Id_Obras ||
    item?.Id_Obra ||
    item?.Id_Repertorio ||
    item?.IdRepertorio ||
    item?.id_repertorio ||
    item?.repertorioId
  );
}

function resolverIdPorCatalogo(item = {}, catalogo = []) {
  const directo = idProgramaDirecto(item);
  if (directo) return directo;

  const nome = normalizarTexto(item?.obra || item?.nomeObra || item?.nome || item?.titulo);
  if (!nome) return '';

  const candidatos = catalogo.filter((obra) => normalizarTexto(obra.nome) === nome);
  if (candidatos.length === 1) return candidatos[0].id;
  if (candidatos.length === 0) return '';

  const autor = normalizarTexto(item?.autor || item?.compositor);
  if (!autor) return '';
  const porAutor = candidatos.filter((obra) => {
    const autorCatalogo = normalizarTexto(obra.autor);
    return autorCatalogo && (autorCatalogo === autor || autorCatalogo.includes(autor) || autor.includes(autorCatalogo));
  });
  return porAutor.length === 1 ? porAutor[0].id : '';
}

function prepararPrograma(programa = [], catalogo = []) {
  if (!Array.isArray(programa)) return [];
  return programa.map((item) => {
    const idObra = resolverIdPorCatalogo(item, catalogo);
    return {
      ...item,
      id: idObra,
      idRepertorio: idObra
    };
  });
}

function prepararConcertosPortal(concertos = [], catalogo = []) {
  return concertos
    .filter((concerto) => clean(concerto?.id))
    .map((concerto) => {
      const id = clean(concerto.id);
      const historico = id.startsWith('hist-');
      const estado = normalizarEstado(concerto.estado);
      const futuroVisible = estado === 'previsto' || estado === 'confirmado';
      const realizadoVisible = estado === 'realizado' && dataCanon(concerto.data) >= '2026-04-01';
      const visibleNoPortal = !historico && (futuroVisible || realizadoVisible);

      return {
        ...concerto,
        programa: prepararPrograma(concerto.programa, catalogo),
        mostrarWeb: visibleNoPortal
      };
    });
}

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
  return usuario?.email && usuario.emailVerified === true ? usuario : null;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, erro: 'Método non permitido' });
  const body = await request.json().catch(() => null);
  const usuario = await verificarTokenFirebase(body?.idToken, env.FIREBASE_API_KEY).catch(() => null);
  if (!usuario) return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  if (!env.R2_PRIVADO) return json(500, { ok: false, erro: 'O índice privado non está configurado.' });

  const inicio = Date.now();
  const key = indiceKey(env);
  const [obxecto, catalogo] = await Promise.all([
    env.R2_PRIVADO.get(key),
    lerCatalogoRepertorio(env)
  ]);
  if (!obxecto) {
    return json(503, {
      ok: false,
      erro: `O índice de concertos de ${rama(env)} aínda non está dispoñible.`
    });
  }

  const indice = await obxecto.json().catch(() => null);
  if (indice?.ok !== true || !Array.isArray(indice?.concertos)) {
    return json(503, { ok: false, erro: 'O índice de concertos non é válido.' });
  }

  const concertos = prepararConcertosPortal(indice.concertos, catalogo);
  const duracion = Date.now() - inicio;

  return json(200, {
    ...indice,
    concertos,
    cache: 'R2',
    rama: rama(env),
    regraPortal: 'Previsto+Confirmado; Realizado desde 2026-04-01; Aprazado/Cancelado só Administración; só id hist-* vai ao Histórico',
    repertorioCatalogo: catalogo.length,
    tempoRespostaMs: duracion
  }, {
    'X-SCPP-Concertos-Index': rama(env) === 'main' ? 'R2-PRIVADO-MAIN' : 'R2-PRIVADO-PREVIEW',
    'X-SCPP-Concertos-Portal-Rule': 'previsto-confirmado-realizado-desde-2026-04-01',
    'X-SCPP-Repertorio-Catalogo': String(catalogo.length),
    'Server-Timing': `r2;dur=${duracion}`
  });
}
