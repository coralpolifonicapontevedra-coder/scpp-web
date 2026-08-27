(() => {
  const formularios = document.querySelectorAll('[data-solicitud-form]');
  const inicios = new WeakMap();

  function actualizarCamposCondicionales(formulario) {
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

  function mostrarEstado(formulario, mensaje, tipo = '') {
    const estado = formulario.querySelector('[data-form-status]');
    if (!estado) return;
    estado.textContent = mensaje;
    estado.dataset.state = tipo;
    estado.hidden = !mensaje;
  }

  function obtenerDatos(formulario) {
    const datos = new FormData(formulario);
    return {
      orixe: formulario.dataset.orixe || 'Contacto',
      tipoSolicitude: String(datos.get('tipoSolicitude') || ''),
      nomeCompleto: String(datos.get('nomeCompleto') || ''),
      correoElectronico: String(datos.get('correoElectronico') || ''),
      telefono: String(datos.get('telefono') || ''),
      entidade: String(datos.get('entidade') || ''),
      cordaPreferente: String(datos.get('cordaPreferente') || ''),
      experienciaCoral: String(datos.get('experienciaCoral') || ''),
      mensaxe: String(datos.get('mensaxe') || ''),
      aceptacionProteccionDatos: datos.get('aceptacionProteccionDatos') === 'on',
      versionTextoLegal: formulario.dataset.versionLegal || 'formularios-web-v1',
      formStartedAt: inicios.get(formulario),
      website: String(datos.get('website') || '')
    };
  }

  formularios.forEach((formulario) => {
    inicios.set(formulario, Date.now());
    actualizarCamposCondicionales(formulario);

    formulario.elements.tipoSolicitude?.addEventListener('change', () => {
      actualizarCamposCondicionales(formulario);
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
      mostrarEstado(formulario, 'Enviando la solicitud…', 'loading');

      try {
        const respuesta = await fetch('/api/solicitudes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(obtenerDatos(formulario))
        });
        const resultado = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !resultado.ok) {
          throw new Error(resultado.erro || 'No ha sido posible enviar la solicitud.');
        }

        const referencia = String(resultado.idSolicitude || '').trim();
        formulario.reset();
        inicios.set(formulario, Date.now());
        actualizarCamposCondicionales(formulario);
        mostrarEstado(
          formulario,
          referencia
            ? `Solicitud recibida correctamente. Referencia: ${referencia}`
            : 'Solicitud recibida correctamente.',
          'success'
        );
      } catch (error) {
        mostrarEstado(
          formulario,
          error instanceof Error ? error.message : 'Se ha producido un error al enviar la solicitud.',
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

  document.querySelectorAll('[data-seleccionar-solicitud]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const selector = boton.dataset.formTarget
        ? document.querySelector(boton.dataset.formTarget)
        : document.querySelector('[data-solicitud-form]');
      if (!(selector instanceof HTMLFormElement)) return;

      const tipo = boton.dataset.seleccionarSolicitud || '';
      const campoTipo = selector.elements.tipoSolicitude;
      if (campoTipo) {
        campoTipo.value = tipo;
        campoTipo.dispatchEvent(new Event('change', { bubbles: true }));
      }
      selector.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => selector.elements.nomeCompleto?.focus(), 350);
    });
  });
})();
