(() => {
  'use strict';

  const previousFetch = window.fetch.bind(window);
  const IDS_BRAIS_RETIRADOS = new Set(['80', '81', '82', '83', '84', '85', '86']);
  const obrasPorId = new Map();
  let organizando = false;

  for (const key of [
    'scpp:repertorio:completo:v2',
    'scpp:repertorio:completo:v3',
    'scpp:repertorio:completo:v4'
  ]) localStorage.removeItem(key);

  function canonId(valor) {
    const texto = String(valor ?? '').trim();
    if (!texto) return '';
    const numero = Number(texto.replace(',', '.'));
    return Number.isFinite(numero) ? String(Math.trunc(numero)) : texto;
  }

  function idObra(obra) {
    return canonId(obra?.id ?? obra?.Id_Repertorio ?? obra?.idRepertorio);
  }

  function filtrarSerieRetirada(resultado) {
    if (!resultado || !Array.isArray(resultado.obras)) return resultado;
    resultado.obras = resultado.obras.filter((obra) => !IDS_BRAIS_RETIRADOS.has(idObra(obra)));
    return resultado;
  }

  function indexarObras(resultado) {
    obrasPorId.clear();
    if (!Array.isArray(resultado?.obras)) return;
    resultado.obras.forEach((obra) => {
      const id = idObra(obra);
      if (id) obrasPorId.set(id, obra);
    });
  }

  function normalizar(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function textoAudio(audio) {
    return normalizar([
      audio?.nome,
      audio?.nombre,
      audio?.ruta,
      audio?.r2Key,
      audio?.AudioFile,
      audio?.tipo,
      audio?.voz
    ].filter(Boolean).join(' '));
  }

  function tipoOrganizacion(obra) {
    const titulo = normalizar(obra?.nomeObra ?? obra?.NomeObra ?? obra?.titulo);
    if (titulo.includes('leucoina')) return 'leucoina';
    if (titulo.includes('misa brevis') || titulo.includes('missa brevis')) return 'misa-brevis';

    const id = idObra(obra);
    if (id === '78') return 'leucoina';
    if (id === '79') return 'misa-brevis';
    return '';
  }

  function grupoLeucoina(audio) {
    const texto = textoAudio(audio);
    const regras = [
      [/escena\s*iii\s*b|escena[-_ ]*3b|iii\s*b/, 'Escena IIIb'],
      [/escena\s*iii\s*a|escena[-_ ]*3a|iii\s*a/, 'Escena IIIa'],
      [/escena\s*vi(?!i)|escena[-_ ]*6(?!\d)/, 'Escena VI'],
      [/escena\s*v(?!i)|escena[-_ ]*5(?!\d)/, 'Escena V'],
      [/escena\s*iv(?!i)|escena[-_ ]*4(?!\d)/, 'Escena IV'],
      [/escena\s*iii(?!\s*[ab])|escena[-_ ]*3(?![ab\d])/, 'Escena III'],
      [/escena\s*ii(?!i)|escena[-_ ]*2(?!\d)/, 'Escena II'],
      [/escena\s*i(?!i)|escena[-_ ]*1(?!\d)/, 'Escena I']
    ];
    return regras.find(([patron]) => patron.test(texto))?.[1] || 'Outros audios';
  }

  function grupoMisaBrevis(audio) {
    const texto = textoAudio(audio);
    const regras = [
      [/benedictus/, 'Benedictus'],
      [/agnus(?:\s+dei)?/, 'Agnus Dei'],
      [/sanctus/, 'Sanctus'],
      [/gloria/, 'Gloria'],
      [/credo/, 'Credo'],
      [/kyrie|kirie/, 'Kyrie']
    ];
    return regras.find(([patron]) => patron.test(texto))?.[1] || 'Outros audios';
  }

  function nomeVoz(audio) {
    const voz = String(audio?.voz || '').trim();
    if (voz) return voz;

    const texto = textoAudio(audio);
    const regras = [
      [/soprano/, 'Soprano'],
      [/contralto|contraalto|alto/, 'Contralto'],
      [/tenor/, 'Tenor'],
      [/baixo|bajo|bass/, 'Baixo'],
      [/tutti|conxunto|completo/, 'Conxunto']
    ];
    return regras.find(([patron]) => patron.test(texto))?.[1] || 'Outras voces';
  }

  const ORDE_ESCENAS = [
    'Escena I', 'Escena II', 'Escena III', 'Escena IIIa', 'Escena IIIb',
    'Escena IV', 'Escena V', 'Escena VI', 'Outros audios'
  ];
  const ORDE_MISA = ['Kyrie', 'Gloria', 'Credo', 'Sanctus', 'Benedictus', 'Agnus Dei', 'Outros audios'];
  const ORDE_VOCES = ['Soprano', 'Contralto', 'Tenor', 'Baixo', 'Conxunto', 'Outras voces'];

  function ordenarNomes(nomes, ordePreferida) {
    return [...nomes].sort((a, b) => {
      const ia = ordePreferida.indexOf(a);
      const ib = ordePreferida.indexOf(b);
      if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      }
      return a.localeCompare(b, 'gl');
    });
  }

  function engadirEstilos() {
    if (document.querySelector('#scpp-audios-organizados-style')) return;
    const style = document.createElement('style');
    style.id = 'scpp-audios-organizados-style';
    style.textContent = `
      .audio-group { margin: 0 0 1.15rem; }
      .audio-group:last-child { margin-bottom: 0; }
      .audio-group-title {
        margin: 0 0 .65rem;
        padding: .48rem .7rem;
        border-left: 3px solid var(--color-primary, #7b2436);
        background: rgba(123, 36, 54, .07);
        font-size: .95rem;
      }
      .audio-voice-group { margin: 0 0 .8rem; }
      .audio-voice-group:last-child { margin-bottom: 0; }
      .audio-voice-title {
        margin: 0 0 .45rem;
        font-size: .82rem;
        font-weight: 700;
        letter-spacing: .02em;
        color: var(--color-primary, #7b2436);
      }
      .audios-list.is-organized {
        display: block !important;
      }
      .audio-group-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: .75rem;
      }
      .audios-list[data-audio-organization="leucoina"] .audio-group-list {
        grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
        gap: .5rem;
      }
      .audios-list[data-audio-organization="leucoina"] .audio-card {
        min-height: 104px !important;
        padding: .65rem !important;
        gap: .5rem !important;
      }
      .audios-list[data-audio-organization="leucoina"] .audio-heading strong {
        font-size: .78rem !important;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      .audios-list[data-audio-organization="leucoina"] .audio-play {
        min-height: 2rem !important;
        padding: .38rem .55rem !important;
        font-size: .68rem !important;
      }
      @media (max-width: 680px) {
        .audios-list[data-audio-organization="leucoina"] .audio-group-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `;
    document.head.append(style);
  }

  function crearSeccion(tituloTexto) {
    const seccion = document.createElement('section');
    seccion.className = 'audio-group';
    const titulo = document.createElement('h4');
    titulo.className = 'audio-group-title';
    titulo.textContent = tituloTexto;
    seccion.append(titulo);
    return seccion;
  }

  function organizarMisaBrevis(audios, tarxetas) {
    const grupos = new Map();
    audios.forEach((audio, indice) => {
      const grupo = grupoMisaBrevis(audio);
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo).push(tarxetas[indice]);
    });

    const fragmento = document.createDocumentFragment();
    ordenarNomes(grupos.keys(), ORDE_MISA).forEach((grupo) => {
      const seccion = crearSeccion(grupo);
      const grella = document.createElement('div');
      grella.className = 'audio-group-list';
      grupos.get(grupo).forEach((tarxeta) => grella.append(tarxeta));
      seccion.append(grella);
      fragmento.append(seccion);
    });
    return fragmento;
  }

  function organizarLeucoina(audios, tarxetas) {
    const escenas = new Map();
    audios.forEach((audio, indice) => {
      const escena = grupoLeucoina(audio);
      const voz = nomeVoz(audio);
      if (!escenas.has(escena)) escenas.set(escena, new Map());
      const voces = escenas.get(escena);
      if (!voces.has(voz)) voces.set(voz, []);
      voces.get(voz).push(tarxetas[indice]);
    });

    const fragmento = document.createDocumentFragment();
    ordenarNomes(escenas.keys(), ORDE_ESCENAS).forEach((escena) => {
      const seccion = crearSeccion(escena);
      const voces = escenas.get(escena);
      ordenarNomes(voces.keys(), ORDE_VOCES).forEach((voz) => {
        const bloqueVoz = document.createElement('div');
        bloqueVoz.className = 'audio-voice-group';
        const tituloVoz = document.createElement('h5');
        tituloVoz.className = 'audio-voice-title';
        tituloVoz.textContent = voz;
        const grella = document.createElement('div');
        grella.className = 'audio-group-list';
        voces.get(voz).forEach((tarxeta) => grella.append(tarxeta));
        bloqueVoz.append(tituloVoz, grella);
        seccion.append(bloqueVoz);
      });
      fragmento.append(seccion);
    });
    return fragmento;
  }

  function organizarAudios() {
    if (organizando || !location.pathname.startsWith('/portal/repertorio')) return;
    const id = canonId(new URL(location.href).searchParams.get('id'));
    const obra = obrasPorId.get(id);
    const tipo = tipoOrganizacion(obra);
    const lista = document.querySelector('#audios-list');
    if (!(lista instanceof HTMLElement)) return;
    if (!obra || !tipo) {
      lista.classList.remove('is-organized');
      delete lista.dataset.audioOrganization;
      return;
    }

    const audios = Array.isArray(obra.audios) ? obra.audios : [];
    if (!audios.length) return;

    const tarxetas = Array.from(lista.children).filter((elemento) => elemento.classList.contains('audio-card'));
    if (tarxetas.length !== audios.length) return;

    engadirEstilos();
    lista.classList.add('is-organized');
    lista.dataset.audioOrganization = tipo;
    organizando = true;
    try {
      const fragmento = tipo === 'leucoina'
        ? organizarLeucoina(audios, tarxetas)
        : organizarMisaBrevis(audios, tarxetas);
      lista.replaceChildren(fragmento);
    } finally {
      organizando = false;
    }
  }

  const observer = new MutationObserver(() => queueMicrotask(organizarAudios));
  function iniciarOrganizacion() {
    const lista = document.querySelector('#audios-list');
    if (!(lista instanceof HTMLElement)) return;
    observer.observe(lista, { childList: true });
    organizarAudios();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarOrganizacion, { once: true });
  } else {
    iniciarOrganizacion();
  }

  window.fetch = async (input, init) => {
    const response = await previousFetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (!location.pathname.startsWith('/portal/repertorio') || !url.includes('/api/repertorio') || !response.ok) return response;

    let body;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    if (body?.accion !== 'listarRepertorioPortal') return response;

    const resultado = filtrarSerieRetirada(await response.clone().json().catch(() => null));
    if (!resultado?.ok || !Array.isArray(resultado.obras)) return response;
    indexarObras(resultado);

    return new Response(JSON.stringify(resultado), {
      status: response.status,
      headers: response.headers
    });
  };
})();
