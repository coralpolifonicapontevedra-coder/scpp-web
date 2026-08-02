(() => {
  'use strict';

  const previousFetch = window.fetch.bind(window);
  const IDS_BRAIS_RETIRADOS = new Set(['80', '81', '82', '83', '84', '85', '86']);
  const obrasPorId = new Map();

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

  function grupoMissaBrevis(audio) {
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

  function ordeGrupos(id) {
    return id === '78'
      ? ['Escena I', 'Escena II', 'Escena III', 'Escena IIIa', 'Escena IIIb', 'Escena IV', 'Escena V', 'Escena VI', 'Outros audios']
      : ['Kyrie', 'Gloria', 'Credo', 'Sanctus', 'Benedictus', 'Agnus Dei', 'Outros audios'];
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
      .audio-group-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: .75rem;
      }
    `;
    document.head.append(style);
  }

  function organizarAudios() {
    if (!location.pathname.startsWith('/portal/repertorio')) return;
    const id = canonId(new URL(location.href).searchParams.get('id'));
    if (!['78', '79'].includes(id)) return;

    const obra = obrasPorId.get(id);
    const audios = Array.isArray(obra?.audios) ? obra.audios : [];
    const lista = document.querySelector('#audios-list');
    if (!(lista instanceof HTMLElement) || !audios.length) return;

    const tarxetas = Array.from(lista.children).filter((elemento) => elemento.classList.contains('audio-card'));
    if (tarxetas.length !== audios.length) return;

    const clasificar = id === '78' ? grupoLeucoina : grupoMissaBrevis;
    const grupos = new Map();
    audios.forEach((audio, indice) => {
      const nomeGrupo = clasificar(audio);
      if (!grupos.has(nomeGrupo)) grupos.set(nomeGrupo, []);
      grupos.get(nomeGrupo).push(tarxetas[indice]);
    });

    engadirEstilos();
    const fragmento = document.createDocumentFragment();
    ordeGrupos(id).forEach((nomeGrupo) => {
      const elementos = grupos.get(nomeGrupo);
      if (!elementos?.length) return;
      const seccion = document.createElement('section');
      seccion.className = 'audio-group';
      const titulo = document.createElement('h4');
      titulo.className = 'audio-group-title';
      titulo.textContent = nomeGrupo;
      const grella = document.createElement('div');
      grella.className = 'audio-group-list';
      elementos.forEach((elemento) => grella.append(elemento));
      seccion.append(titulo, grella);
      fragmento.append(seccion);
    });
    lista.replaceChildren(fragmento);
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
