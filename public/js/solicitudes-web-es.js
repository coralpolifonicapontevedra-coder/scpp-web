(() => {
  const formularios = document.querySelectorAll('[data-solicitud-form]');
  const inicios = new WeakMap();
  const modales = new WeakMap();
  const justificantes = new WeakMap();

  function cargarEstilosModal() {
    if (document.querySelector('link[data-solicitudes-modal-css]')) return;
    const enlace = document.createElement('link');
    enlace.rel = 'stylesheet';
    enlace.href = '/css/solicitudes-modal.css';
    enlace.dataset.solicitudesModalCss = 'true';
    document.head.appendChild(enlace);
  }

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

  function mostrarEstado(formulario, mensaje, tipo) {
    const estado = formulario.querySelector('[data-form-status]');
    if (!estado) return;
    estado.textContent = mensaje;
    estado.dataset.state = tipo || '';
    estado.hidden = !mensaje;
  }

  function obtenerDatosFormulario(formulario) {
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

  function restablecerModal(formulario) {
    const modal = modales.get(formulario);
    if (!modal) return;
    const contenido = modal.querySelector('[data-modal-form-content]');
    const confirmacion = modal.querySelector('[data-modal-confirmacion]');
    const botonDescarga = modal.querySelector('[data-descargar-xustificante]');
    if (contenido) contenido.hidden = false;
    if (confirmacion) confirmacion.hidden = true;
    if (botonDescarga instanceof HTMLButtonElement) {
      botonDescarga.disabled = false;
      botonDescarga.textContent = 'Descargar justificante en PDF';
    }
    justificantes.delete(formulario);
    mostrarEstado(formulario, '', '');
  }

  function cerrarModal(formulario) {
    const modal = modales.get(formulario);
    if (modal?.open) modal.close();
  }

  function crearModalColabora(formulario) {
    const seccion = formulario.closest('.formulario-colabora');
    if (!seccion || typeof HTMLDialogElement === 'undefined') return null;

    formulario.querySelector('option[value="Colaboración en especie"]')?.remove();
    formulario.querySelectorAll('[data-visible-para]').forEach((grupo) => {
      if (grupo.dataset.visiblePara?.includes('Empresa ou mecenado')) {
        grupo.dataset.visiblePara = 'Empresa ou mecenado';
      }
    });

    const dialogo = document.createElement('dialog');
    dialogo.className = 'solicitude-modal';
    dialogo.setAttribute('aria-labelledby', 'titulo-form-colabora');

    const panel = document.createElement('div');
    panel.className = 'solicitude-modal__panel';

    const cabecera = document.createElement('div');
    cabecera.className = 'solicitude-modal__topbar';
    cabecera.innerHTML = `
      <span>Sociedad Coral Polifónica de Pontevedra</span>
      <button type="button" class="solicitude-modal__close" data-modal-close aria-label="Cerrar la ventana">×</button>
    `;

    const contenido = document.createElement('div');
    contenido.className = 'solicitude-modal__content';
    contenido.dataset.modalFormContent = 'true';

    seccion.classList.remove('formulario-colabora');
    seccion.classList.add('solicitude-modal__form-section');
    contenido.appendChild(seccion);

    const confirmacion = document.createElement('section');
    confirmacion.className = 'solicitude-confirmacion';
    confirmacion.dataset.modalConfirmacion = 'true';
    confirmacion.hidden = true;
    confirmacion.innerHTML = `
      <div class="solicitude-confirmacion__icon" aria-hidden="true">✓</div>
      <p class="sobrelinea">Solicitud registrada</p>
      <h2>La hemos recibido correctamente</h2>
      <p class="solicitude-confirmacion__texto">
        Hemos guardado tu solicitud y enviaremos la respuesta al correo indicado.
      </p>
      <dl class="solicitude-confirmacion__datos">
        <div><dt>Referencia</dt><dd data-confirmacion-referencia></dd></div>
        <div><dt>Tipo</dt><dd data-confirmacion-tipo></dd></div>
        <div><dt>Fecha</dt><dd data-confirmacion-data></dd></div>
      </dl>
      <p class="solicitude-confirmacion__nota">
        El documento descargable acredita la recepción de la solicitud. No es un
        justificante de pago ni supone la aprobación automática de un alta,
        colaboración o acuerdo de mecenazgo.
      </p>
      <div class="solicitude-confirmacion__actions">
        <button type="button" class="btn-enviar" data-descargar-xustificante>
          Descargar justificante en PDF
        </button>
        <button type="button" class="btn-secundario" data-modal-close>Cerrar</button>
      </div>
    `;

    panel.append(cabecera, contenido, confirmacion);
    dialogo.appendChild(panel);
    document.body.appendChild(dialogo);

    dialogo.querySelectorAll('[data-modal-close]').forEach((boton) => {
      boton.addEventListener('click', () => cerrarModal(formulario));
    });

    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) cerrarModal(formulario);
    });

    dialogo.addEventListener('close', () => {
      formulario.reset();
      inicios.set(formulario, Date.now());
      actualizarCamposCondicionales(formulario);
      restablecerModal(formulario);
    });

    dialogo.querySelector('[data-descargar-xustificante]')?.addEventListener('click', async (evento) => {
      const boton = evento.currentTarget;
      const justificante = justificantes.get(formulario);
      if (!justificante || !(boton instanceof HTMLButtonElement)) return;
      const texto = boton.textContent;
      boton.disabled = true;
      boton.textContent = 'Preparando PDF…';
      try {
        await descargarJustificantePdf(justificante);
        boton.textContent = 'Descarga iniciada…';
        window.setTimeout(() => cerrarModal(formulario), 350);
      } catch (error) {
        boton.disabled = false;
        boton.textContent = texto;
        window.alert('No ha sido posible crear el PDF. Puedes cerrar la ventana y conservar la referencia mostrada.');
      }
    });

    modales.set(formulario, dialogo);
    return dialogo;
  }

  function mostrarConfirmacionModal(formulario, justificante) {
    const modal = modales.get(formulario);
    if (!modal) return false;

    justificantes.set(formulario, justificante);
    const contenido = modal.querySelector('[data-modal-form-content]');
    const confirmacion = modal.querySelector('[data-modal-confirmacion]');
    const botonDescarga = modal.querySelector('[data-descargar-xustificante]');
    if (contenido) contenido.hidden = true;
    if (confirmacion) confirmacion.hidden = false;
    if (botonDescarga instanceof HTMLButtonElement) {
      botonDescarga.disabled = false;
      botonDescarga.textContent = 'Descargar justificante en PDF';
    }

    const referencia = modal.querySelector('[data-confirmacion-referencia]');
    const tipo = modal.querySelector('[data-confirmacion-tipo]');
    const fecha = modal.querySelector('[data-confirmacion-data]');
    if (referencia) referencia.textContent = justificante.idSolicitude;
    if (tipo) tipo.textContent = justificante.tipoSolicitude;
    if (fecha) fecha.textContent = formatoFechaHora(justificante.dataHora);

    confirmacion?.scrollIntoView({ block: 'start' });
    botonDescarga?.focus();
    return true;
  }

  function formatoFechaHora(fecha) {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(fecha);
  }

  function dibujarTextoEnvuelto(ctx, texto, x, y, anchoMaximo, altoLinea, maximoLineas = Infinity) {
    const palabras = String(texto || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lineas = [];
    let linea = '';

    palabras.forEach((palabra) => {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width <= anchoMaximo) {
        linea = prueba;
      } else {
        if (linea) lineas.push(linea);
        linea = palabra;
      }
    });
    if (linea) lineas.push(linea);

    const visibles = lineas.slice(0, maximoLineas);
    if (lineas.length > maximoLineas && visibles.length) {
      visibles[visibles.length - 1] = `${visibles[visibles.length - 1].replace(/[.…]+$/, '')}…`;
    }
    visibles.forEach((valor, indice) => ctx.fillText(valor, x, y + indice * altoLinea));
    return y + visibles.length * altoLinea;
  }

  function canvasAJpeg(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo crear la imagen del justificante'));
      }, 'image/jpeg', 0.94);
    });
  }

  function crearPdfConJpeg(bytesJpeg, anchoImagen, altoImagen) {
    const encoder = new TextEncoder();
    const fragmentos = [];
    const offsets = [0];
    let longitud = 0;

    const añadir = (valor) => {
      const bytes = typeof valor === 'string' ? encoder.encode(valor) : valor;
      fragmentos.push(bytes);
      longitud += bytes.length;
    };

    const objeto = (numero, contenido) => {
      offsets[numero] = longitud;
      añadir(`${numero} 0 obj\n${contenido}\nendobj\n`);
    };

    añadir('%PDF-1.4\n%âãÏÓ\n');
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objeto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objeto(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');

    offsets[4] = longitud;
    añadir(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${anchoImagen} /Height ${altoImagen} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytesJpeg.length} >>\nstream\n`);
    añadir(bytesJpeg);
    añadir('\nendstream\nendobj\n');

    const instrucciones = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
    objeto(5, `<< /Length ${encoder.encode(instrucciones).length} >>\nstream\n${instrucciones}endstream`);

    const inicioXref = longitud;
    añadir('xref\n0 6\n0000000000 65535 f \n');
    for (let i = 1; i <= 5; i += 1) {
      añadir(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    añadir(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`);

    const resultado = new Uint8Array(longitud);
    let posicion = 0;
    fragmentos.forEach((fragmento) => {
      resultado.set(fragmento, posicion);
      posicion += fragmento.length;
    });
    return resultado;
  }

  async function descargarJustificantePdf(datos) {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite crear el documento');

    const granate = '#6a1b29';
    const dorado = '#aa8453';
    const texto = '#252525';
    const gris = '#6c6c6c';
    const claro = '#f5f2ee';
    const izquierda = 110;
    const ancho = canvas.width - izquierda * 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = granate;
    ctx.fillRect(0, 0, canvas.width, 34);

    ctx.fillStyle = granate;
    ctx.font = '700 34px Arial, sans-serif';
    ctx.fillText('SOCIEDAD CORAL POLIFÓNICA DE PONTEVEDRA', izquierda, 125);
    ctx.fillStyle = dorado;
    ctx.fillRect(izquierda, 155, 120, 5);

    ctx.fillStyle = texto;
    ctx.font = '700 58px Arial, sans-serif';
    ctx.fillText('Justificante de recepción', izquierda, 255);
    ctx.fillStyle = gris;
    ctx.font = '28px Arial, sans-serif';
    ctx.fillText('Solicitud enviada desde la web de la SCPP', izquierda, 305);

    ctx.fillStyle = claro;
    ctx.fillRect(izquierda, 360, ancho, 190);
    ctx.fillStyle = granate;
    ctx.font = '700 24px Arial, sans-serif';
    ctx.fillText('REFERENCIA', izquierda + 34, 415);
    ctx.fillStyle = texto;
    ctx.font = '700 42px Arial, sans-serif';
    ctx.fillText(datos.idSolicitude, izquierda + 34, 470);
    ctx.fillStyle = gris;
    ctx.font = '25px Arial, sans-serif';
    ctx.fillText(formatoFechaHora(datos.dataHora), izquierda + 34, 520);

    let y = 625;
    const campo = (etiqueta, valor) => {
      if (!valor) return;
      ctx.fillStyle = granate;
      ctx.font = '700 22px Arial, sans-serif';
      ctx.fillText(etiqueta.toUpperCase(), izquierda, y);
      y += 38;
      ctx.fillStyle = texto;
      ctx.font = '29px Arial, sans-serif';
      y = dibujarTextoEnvuelto(ctx, valor, izquierda, y, ancho, 38, 3) + 35;
    };

    campo('Tipo de solicitud', datos.tipoSolicitude);
    campo('Nombre', datos.nomeCompleto);
    campo('Correo electrónico', datos.correoElectronico);
    campo('Teléfono', datos.telefono);
    campo('Empresa o entidad', datos.entidade);
    campo('Cuerda preferente', datos.cordaPreferente);

    if (y < 1190) {
      ctx.fillStyle = granate;
      ctx.font = '700 22px Arial, sans-serif';
      ctx.fillText('RESUMEN DEL MENSAJE', izquierda, y);
      y += 40;
      ctx.fillStyle = texto;
      ctx.font = '26px Arial, sans-serif';
      dibujarTextoEnvuelto(ctx, datos.mensaxe, izquierda, y, ancho, 36, 8);
    }

    ctx.strokeStyle = '#d8cec4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(izquierda, 1450);
    ctx.lineTo(canvas.width - izquierda, 1450);
    ctx.stroke();

    ctx.fillStyle = texto;
    ctx.font = '700 25px Arial, sans-serif';
    ctx.fillText('Documento informativo', izquierda, 1510);
    ctx.fillStyle = gris;
    ctx.font = '23px Arial, sans-serif';
    dibujarTextoEnvuelto(
      ctx,
      'Este documento acredita la recepción de la solicitud. No es un justificante de pago ni implica la aprobación automática de un alta, colaboración o acuerdo.',
      izquierda,
      1555,
      ancho,
      32,
      4
    );

    ctx.fillStyle = granate;
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText('coralpolifonicapontevedra.org', izquierda, 1690);
    ctx.fillStyle = gris;
    ctx.font = '21px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Rúa Luís Braille 40 · 36003 Pontevedra', canvas.width - izquierda, 1690);
    ctx.textAlign = 'left';

    const jpeg = await canvasAJpeg(canvas);
    const bytesJpeg = new Uint8Array(await jpeg.arrayBuffer());
    const pdf = crearPdfConJpeg(bytesJpeg, canvas.width, canvas.height);
    const blobPdf = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blobPdf);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `justificante-${datos.idSolicitude}.pdf`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  cargarEstilosModal();

  formularios.forEach((formulario) => {
    inicios.set(formulario, Date.now());
    actualizarCamposCondicionales(formulario);

    if (formulario.dataset.orixe === 'Colabora') crearModalColabora(formulario);

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

      const payload = obtenerDatosFormulario(formulario);

      try {
        const respuesta = await fetch('/api/solicitudes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const resultado = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !resultado.ok) {
          throw new Error(resultado.erro || 'No ha sido posible enviar la solicitud');
        }

        const justificante = {
          ...payload,
          idSolicitude: resultado.idSolicitude || 'SIN-REFERENCIA',
          dataHora: new Date()
        };

        formulario.reset();
        inicios.set(formulario, Date.now());
        actualizarCamposCondicionales(formulario);

        if (!mostrarConfirmacionModal(formulario, justificante)) {
          mostrarEstado(
            formulario,
            resultado.idSolicitude
              ? `Solicitud recibida correctamente. Referencia: ${resultado.idSolicitude}`
              : 'Solicitud recibida correctamente.',
            'success'
          );
        }
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
        : document.querySelector('[data-solicitud-form][data-orixe="Colabora"]');
      if (!(selector instanceof HTMLFormElement)) return;

      restablecerModal(selector);
      const tipo = boton.dataset.seleccionarSolicitud || '';
      const campoTipo = selector.elements.tipoSolicitude;
      if (campoTipo) {
        campoTipo.value = tipo;
        campoTipo.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const modal = modales.get(selector);
      if (modal && !modal.open) modal.showModal();
      window.setTimeout(() => selector.elements.nomeCompleto?.focus(), 80);
    });
  });
})();
