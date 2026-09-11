const INDEX_PATH = 'indices/galeria-publica-v1.json';

const TEATRO_COLON_2026_IDS = new Set([
  'f3b24569-cf0e-4cbf-bf46-c221b7ada3e2',
  '9043342b-0215-4c5f-9c4c-fa40dece2cc5',
  '6a5e46aa-860b-4e22-b711-28af32618c03',
  '3ee2474c-04ac-4c46-a602-0c4d2b898e4e',
  '5ebcd8cc-5197-434c-9796-d1f682d68461',
  '3188742f-9055-4959-adbe-50c765983fae',
  'e596fdb6-9fa3-4587-a3ac-5cc67e17c47d',
  '66f6a72f-0137-43a9-9d0f-f236005f4a5e',
  'd5468d17-b8b2-4ed3-a265-02583b025e5e'
]);

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...extraHeaders
  }
});

function rutaPublica(ruta, version = '') {
  const limpa = String(ruta || '').trim().replace(/^\/+/, '');
  if (!limpa) return '';
  const codificada = limpa
    .split('/')
    .filter(Boolean)
    .map((parte) => encodeURIComponent(parte))
    .join('/');
  const sufixo = version ? `?v=${encodeURIComponent(String(version))}` : '';
  return `/arquivos/publico/${codificada}${sufixo}`;
}

function rutaOrixinal(ruta, version = '') {
  const limpa = String(ruta || '').trim().replace(/^\/+/, '');
  if (!limpa) return '';
  const parametros = new URLSearchParams({ ruta: limpa });
  if (version) parametros.set('v', String(version));
  return `/api/galeria-orixinal?${parametros.toString()}`;
}

function normalizarFoto(foto = {}) {
  const rutaOrixinalR2 = String(
    foto.rutaR2Publica || foto.rutaR2_Publica || foto.RutaR2_Publica || foto.rutaR2 || foto.RutaR2 || ''
  ).trim();
  const rutaMiniatura = String(
    foto.rutaMiniaturaPublica || foto.rutaMiniatura_Publica || foto.RutaMiniaturaPublica || ''
  ).trim();
  const version = String(foto.etagOrixinal || foto.version || foto.xeradoEnMs || '').trim();
  const urlOrixinal = rutaOrixinal(rutaOrixinalR2, version) || String(foto.urlPublica || '').trim();
  const urlMiniaturaDirecta = rutaPublica(rutaMiniatura, version) || String(foto.urlMiniaturaPublica || '').trim();
  const idFoto = String(foto.idFoto || foto.Id_Foto || '').trim();
  const eTeatroColon2026 = TEATRO_COLON_2026_IDS.has(idFoto);

  return {
    ...foto,
    ...(eTeatroColon2026 ? { categoriaPublica: 'Concertos', CategoriaPublica: 'Concertos' } : {}),
    urlPublica: urlOrixinal,
    // A ruta directa de miniaturas queda como dato de diagnóstico, pero a grella
    // usa a mesma ruta fiable que xa funciona ao ampliar. Evita respostas antigas
    // ou incompletas de /arquivos/publico, especialmente en móbil e sen Ctrl+F5.
    urlMiniaturaDirecta,
    urlMiniaturaPublica: urlOrixinal || urlMiniaturaDirecta
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }

  if (!env.R2_PUBLICO) {
    return json(500, { ok: false, erro: 'O bucket público R2 non está configurado.' });
  }

  const inicio = Date.now();
  const obxecto = await env.R2_PUBLICO.get(INDEX_PATH);
  if (!obxecto) {
    return json(503, {
      ok: false,
      erro: 'O índice da galería aínda non está dispoñible.'
    }, {
      'X-SCPP-Index': 'MISSING'
    });
  }

  const indice = await obxecto.json().catch(() => null);
  if (!indice?.ok || !Array.isArray(indice.fotos)) {
    return json(503, {
      ok: false,
      erro: 'O índice da galería non é válido.'
    }, {
      'X-SCPP-Index': 'INVALID'
    });
  }

  return json(200, {
    ...indice,
    fotos: indice.fotos.map(normalizarFoto),
    cache: 'R2-REVALIDADO',
    tempoRespostaMs: Date.now() - inicio
  }, {
    'X-SCPP-Index': 'R2',
    'X-SCPP-Cache': 'REVALIDATED',
    'X-SCPP-Index-Version': String(indice.xeradoEnMs || indice.xeradoEn || ''),
    'Server-Timing': `r2;dur=${Date.now() - inicio}`
  });
}