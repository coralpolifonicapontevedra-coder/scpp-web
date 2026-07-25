(() => {
  const formularios = document.querySelectorAll('[data-solicitude-form]');
  const inicios = new WeakMap();

  function actualizarCamposCondicionais(formulario) {
    const tipo = formulario.elements.tipoSolicitude?.value || '';
    formulario.querySelectorAll('[data-visible-para]').forEach((grupo) => {
      const tipos = String(grupo.dataset.visiblePara || '').split('|');
      const visible = tipos.includes(tipo);
      grupo.hidden = !visible;
      grupo.querySelectorAll('input, select, textarea').forEach((campo) => {
        campo.disabled = !visible;
        if (campo.dataset.requiredWhenVisible === 'true') campo.required = visible;
        if (!visible && campo.type !== 'hidden') campo.value = '';
      });
    });
  }

  function mostrarEstado(formulario, mensaxe, tipo) {
    const estado = formulario.querySelector('[data-form-status]');
    if (!estado) return;
    estado.textContent = mensaxe;
    estado.dataset.state = tipo || '';
    estado.hidden = !mensaxe;
  }

  formularios.forEach((formulario) => {
    inicios.set(formulario, Date.now());
    actualizarCamposCondicionais(formulario);

    formulario.elements.tipoSolicitude?.addEventListener('change', () => {
      actualizarCamposCondicionais(formulario);
    });

    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (!formulario.reportValidity()) return;

      const boton = formulario.querySelector('[type="submit"]');
      const textoBoton = boton?.textContent || '';
      if (boton) {
        boton.disabled = true;
        boton.textContent = 'Enviando…';
      }
      mostrarEstado(formulario, 'Enviando a solicitude…', 'loading');

      const datos = new FormData(formulario);
      const payload = {
        orixe: formulario.dataset.orixe || 'Contacto',
        tipoSolicitude: datos.get('tipoSolicitude'),
        nomeCompleto: datos.get('nomeCompleto'),
        correoElectronico: datos.get('correoElectronico'),
        telefono: datos.get('telefono'),
        entidade: datos.get('entidade'),
        cordaPreferente: datos.get('cordaPreferente'),
        experienciaCoral: datos.get('experienciaCoral'),
        mensaxe: datos.get('mensaxe'),
        aceptacionProteccionDatos: datos.get('aceptacionProteccionDatos') === 'on',
        versionTextoLegal: formulario.dataset.versionLegal || 'formularios-web-v1',
        formStartedAt: inicios.get(formulario),
        website: datos.get('website')
      };

      try {
        const resposta = await fetch('/api/solicitudes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !resultado.ok) {
          throw new Error(resultado.erro || 'Non foi posible enviar a solicitude');
        }

        formulario.reset();
        inicios.set(formulario, Date.now());
        actualizarCamposCondicionais(formulario);
        mostrarEstado(
          formulario,
          resultado.idSolicitude
            ? `Solicitude recibida correctamente. Referencia: ${resultado.idSolicitude}`
            : 'Solicitude recibida correctamente.',
          'success'
        );
      } catch (erro) {
        mostrarEstado(
          formulario,
          erro instanceof Error ? erro.message : 'Produciuse un erro ao enviar a solicitude.',
          'error'
        );
      } finally {
        if (boton) {
          boton.disabled = false;
          boton.textContent = textoBoton;
        }
      }
    });
  });

  document.querySelectorAll('[data-select-solicitude]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const selector = boton.dataset.formTarget
        ? document.querySelector(boton.dataset.formTarget)
        : document.querySelector('[data-solicitude-form][data-orixe="Colabora"]');
      if (!(selector instanceof HTMLFormElement)) return;

      const tipo = boton.dataset.selectSolicitude || '';
      const campoTipo = selector.elements.tipoSolicitude;
      if (campoTipo) {
        campoTipo.value = tipo;
        campoTipo.dispatchEvent(new Event('change', { bubbles: true }));
      }
      selector.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => campoTipo?.focus(), 450);
    });
  });
})();
