(() => {
  const formularios = document.querySelectorAll('[data-solicitude-form]');
  const inicios = new WeakMap();
  const modais = new WeakMap();
  const xustificantes = new WeakMap();

  function cargarEstilosModal() {
    if (document.querySelector('link[data-solicitudes-modal-css]')) return;
    const ligazon = document.createElement('link');
    ligazon.rel = 'stylesheet';
    ligazon.href = '/css/solicitudes-modal.css';
    ligazon.dataset.solicitudesModalCss = 'true';
    document.head.appendChild(ligazon);
  }

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

  function obterDatosFormulario(formulario) {
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
    const modal = modais.get(formulario);
    if (!modal) return;
    const contido = modal.querySelector('[data-modal-form-content]');
    const confirmacion = modal.querySelector('[data-modal-confirmacion]');
    const botonDescarga = modal.querySelector('[data-descargar-xustificante]');
    if (contido) contido.hidden = false;
    if (confirmacion) confirmacion.hidden = true;
    if (botonDescarga instanceof HTMLButtonElement) {
      botonDescarga.disabled = false;
      botonDescarga.textContent = 'Descargar xustificante en PDF';
    }
    xustificantes.delete(formulario);
    mostrarEstado(formulario, '', '');
  }

  function pecharModal(formulario) {
    const modal = modais.get(formulario);
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

    const cabeceira = document.createElement('div');
    cabeceira.className = 'solicitude-modal__topbar';
    cabeceira.innerHTML = `
      <span>Sociedade Coral Polifónica de Pontevedra</span>
      <button type="button" class="solicitude-modal__close" data-modal-close aria-label="Pechar a ventá">×</button>
    `;

    const contido = document.createElement('div');
    contido.className = 'solicitude-modal__content';
    contido.dataset.modalFormContent = 'true';

    seccion.classList.remove('formulario-colabora');
    seccion.classList.add('solicitude-modal__form-section');
    contido.appendChild(seccion);

    const confirmacion = document.createElement('section');
    confirmacion.className = 'solicitude-confirmacion';
    confirmacion.dataset.modalConfirmacion = 'true';
    confirmacion.hidden = true;
    confirmacion.innerHTML = `
      <div class="solicitude-confirmacion__icon" aria-hidden="true">✓</div>
      <p class="sobrelinea">Solicitude rexistrada</p>
      <h2>Recibímola correctamente</h2>
      <p class="solicitude-confirmacion__texto">
        Gardamos a túa solicitude e enviaremos a resposta ao correo indicado.
      </p>
      <dl class="solicitude-confirmacion__datos">
        <div><dt>Referencia</dt><dd data-confirmacion-referencia></dd></div>
        <div><dt>Tipo</dt><dd data-confirmacion-tipo></dd></div>
        <div><dt>Data</dt><dd data-confirmacion-data></dd></div>
      </dl>
      <p class="solicitude-confirmacion__nota">
        O documento descargable acredita a recepción da solicitude. Non é un
        xustificante de pagamento nin supón a aprobación automática dunha alta,
        colaboración ou acordo de mecenado.
      </p>
      <div class="solicitude-confirmacion__actions">
        <button type="button" class="btn-enviar" data-descargar-xustificante>
          Descargar xustificante en PDF
        </button>
        <button type="button" class="btn-secundario" data-modal-close>Pechar</button>
      </div>
    `;

    panel.append(cabeceira, contido, confirmacion);
    dialogo.appendChild(panel);
    document.body.appendChild(dialogo);

    dialogo.querySelectorAll('[data-modal-close]').forEach((boton) => {
      boton.addEventListener('click', () => pecharModal(formulario));
    });

    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) pecharModal(formulario);
    });

    dialogo.addEventListener('close', () => {
      formulario.reset();
      inicios.set(formulario, Date.now());
      actualizarCamposCondicionais(formulario);
      restablecerModal(formulario);
    });

    dialogo.querySelector('[data-descargar-xustificante]')?.addEventListener('click', async (evento) => {
      const boton = evento.currentTarget;
      const xustificante = xustificantes.get(formulario);
      if (!xustificante || !(boton instanceof HTMLButtonElement)) return;
      const texto = boton.textContent;
      boton.disabled = true;
      boton.textContent = 'Preparando PDF…';
      try {
        await descargarXustificantePdf(xustificante);
        boton.textContent = 'Descarga iniciada…';
        window.setTimeout(() => pecharModal(formulario), 350);
      } catch (erro) {
        boton.disabled = false;
        boton.textContent = texto;
        window.alert('Non foi posible crear o PDF. Podes pechar a ventá e conservar a referencia mostrada.');
      }
    });

    modais.set(formulario, dialogo);
    return dialogo;
  }

  function mostrarConfirmacionModal(formulario, xustificante) {
    const modal = modais.get(formulario);
    if (!modal) return false;

    xustificantes.set(formulario, xustificante);
    const contido = modal.querySelector('[data-modal-form-content]');
    const confirmacion = modal.querySelector('[data-modal-confirmacion]');
    const botonDescarga = modal.querySelector('[data-descargar-xustificante]');
    if (contido) contido.hidden = true;
    if (confirmacion) confirmacion.hidden = false;
    if (botonDescarga instanceof HTMLButtonElement) {
      botonDescarga.disabled = false;
      botonDescarga.textContent = 'Descargar xustificante en PDF';
    }

    const referencia = modal.querySelector('[data-confirmacion-referencia]');
    const tipo = modal.querySelector('[data-confirmacion-tipo]');
    const data = modal.querySelector('[data-confirmacion-data]');
    if (referencia) referencia.textContent = xustificante.idSolicitude;
    if (tipo) tipo.textContent = xustificante.tipoSolicitude;
    if (data) data.textContent = formatoDataHora(xustificante.dataHora);

    confirmacion?.scrollIntoView({ block: 'start' });
    botonDescarga?.focus();
    return true;
  }

  function formatoDataHora(data) {
    return new Intl.DateTimeFormat('gl-ES', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(data);
  }

  function debuxarTextoEnvolto(ctx, texto, x, y, anchoMaximo, altoLinea, maximoLinas = Infinity) {
    const palabras = String(texto || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const linas = [];
    let lina = '';

    palabras.forEach((palabra) => {
      const proba = lina ? `${lina} ${palabra}` : palabra;
      if (ctx.measureText(proba).width <= anchoMaximo) {
        lina = proba;
      } else {
        if (lina) linas.push(lina);
        lina = palabra;
      }
    });
    if (lina) linas.push(lina);

    const visibles = linas.slice(0, maximoLinas);
    if (linas.length > maximoLinas && visibles.length) {
      visibles[visibles.length - 1] = `${visibles[visibles.length - 1].replace(/[.…]+$/, '')}…`;
    }
    visibles.forEach((valor, indice) => ctx.fillText(valor, x, y + indice * altoLinea));
    return y + visibles.length * altoLinea;
  }

  function canvasAJepeg(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Non se puido crear a imaxe do xustificante'));
      }, 'image/jpeg', 0.94);
    });
  }

  function crearPdfConJpeg(bytesJpeg, anchoImaxe, altoImaxe) {
    const encoder = new TextEncoder();
    const anacos = [];
    const offsets = [0];
    let lonxitude = 0;

    const engadir = (valor) => {
      const bytes = typeof valor === 'string' ? encoder.encode(valor) : valor;
      anacos.push(bytes);
      lonxitude += bytes.length;
    };

    const obxecto = (numero, contido) => {
      offsets[numero] = lonxitude;
      engadir(`${numero} 0 obj\n${contido}\nendobj\n`);
    };

    engadir('%PDF-1.4\n%âãÏÓ\n');
    obxecto(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obxecto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obxecto(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');

    offsets[4] = lonxitude;
    engadir(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${anchoImaxe} /Height ${altoImaxe} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytesJpeg.length} >>\nstream\n`);
    engadir(bytesJpeg);
    engadir('\nendstream\nendobj\n');

    const instrucions = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
    obxecto(5, `<< /Length ${encoder.encode(instrucions).length} >>\nstream\n${instrucions}endstream`);

    const inicioXref = lonxitude;
    engadir('xref\n0 6\n0000000000 65535 f \n');
    for (let i = 1; i <= 5; i += 1) {
      engadir(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    engadir(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`);

    const resultado = new Uint8Array(lonxitude);
    let posicion = 0;
    anacos.forEach((anaco) => {
      resultado.set(anaco, posicion);
      posicion += anaco.length;
    });
    return resultado;
  }

  async function descargarXustificantePdf(datos) {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('O navegador non permite crear o documento');

    const granate = '#6a1b29';
    const dourado = '#aa8453';
    const texto = '#252525';
    const gris = '#6c6c6c';
    const claro = '#f5f2ee';
    const esquerda = 110;
    const ancho = canvas.width - esquerda * 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = granate;
    ctx.fillRect(0, 0, canvas.width, 34);

    ctx.fillStyle = granate;
    ctx.font = '700 34px Arial, sans-serif';
    ctx.fillText('SOCIEDADE CORAL POLIFÓNICA DE PONTEVEDRA', esquerda, 125);
    ctx.fillStyle = dourado;
    ctx.fillRect(esquerda, 155, 120, 5);

    ctx.fillStyle = texto;
    ctx.font = '700 58px Arial, sans-serif';
    ctx.fillText('Xustificante de recepción', esquerda, 255);
    ctx.fillStyle = gris;
    ctx.font = '28px Arial, sans-serif';
    ctx.fillText('Solicitude enviada desde a web da SCPP', esquerda, 305);

    ctx.fillStyle = claro;
    ctx.fillRect(esquerda, 360, ancho, 190);
    ctx.fillStyle = granate;
    ctx.font = '700 24px Arial, sans-serif';
    ctx.fillText('REFERENCIA', esquerda + 34, 415);
    ctx.fillStyle = texto;
    ctx.font = '700 42px Arial, sans-serif';
    ctx.fillText(datos.idSolicitude, esquerda + 34, 470);
    ctx.fillStyle = gris;
    ctx.font = '25px Arial, sans-serif';
    ctx.fillText(formatoDataHora(datos.dataHora), esquerda + 34, 520);

    let y = 625;
    const campo = (etiqueta, valor) => {
      if (!valor) return;
      ctx.fillStyle = granate;
      ctx.font = '700 22px Arial, sans-serif';
      ctx.fillText(etiqueta.toUpperCase(), esquerda, y);
      y += 38;
      ctx.fillStyle = texto;
      ctx.font = '29px Arial, sans-serif';
      y = debuxarTextoEnvolto(ctx, valor, esquerda, y, ancho, 38, 3) + 35;
    };

    campo('Tipo de solicitude', datos.tipoSolicitude);
    campo('Nome', datos.nomeCompleto);
    campo('Correo electrónico', datos.correoElectronico);
    campo('Teléfono', datos.telefono);
    campo('Empresa ou entidade', datos.entidade);
    campo('Corda preferente', datos.cordaPreferente);

    if (y < 1190) {
      ctx.fillStyle = granate;
      ctx.font = '700 22px Arial, sans-serif';
      ctx.fillText('RESUMO DA MENSAXE', esquerda, y);
      y += 40;
      ctx.fillStyle = texto;
      ctx.font = '26px Arial, sans-serif';
      debuxarTextoEnvolto(ctx, datos.mensaxe, esquerda, y, ancho, 36, 8);
    }

    ctx.strokeStyle = '#d8cec4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(esquerda, 1450);
    ctx.lineTo(canvas.width - esquerda, 1450);
    ctx.stroke();

    ctx.fillStyle = texto;
    ctx.font = '700 25px Arial, sans-serif';
    ctx.fillText('Documento informativo', esquerda, 1510);
    ctx.fillStyle = gris;
    ctx.font = '23px Arial, sans-serif';
    debuxarTextoEnvolto(
      ctx,
      'Este documento acredita a recepción da solicitude. Non é un xustificante de pagamento nin implica a aprobación automática dunha alta, colaboración ou acordo.',
      esquerda,
      1555,
      ancho,
      32,
      4
    );

    ctx.fillStyle = granate;
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText('coralpolifonicapontevedra.org', esquerda, 1690);
    ctx.fillStyle = gris;
    ctx.font = '21px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Rúa Luís Braille 40 · 36003 Pontevedra', canvas.width - esquerda, 1690);
    ctx.textAlign = 'left';

    const jpeg = await canvasAJepeg(canvas);
    const bytesJpeg = new Uint8Array(await jpeg.arrayBuffer());
    const pdf = crearPdfConJpeg(bytesJpeg, canvas.width, canvas.height);
    const blobPdf = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blobPdf);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `xustificante-${datos.idSolicitude}.pdf`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  cargarEstilosModal();

  formularios.forEach((formulario) => {
    inicios.set(formulario, Date.now());
    actualizarCamposCondicionais(formulario);

    if (formulario.dataset.orixe === 'Colabora') crearModalColabora(formulario);

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

      const payload = obterDatosFormulario(formulario);

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

        const xustificante = {
          ...payload,
          idSolicitude: resultado.idSolicitude || 'SEN-REFERENCIA',
          dataHora: new Date()
        };

        formulario.reset();
        inicios.set(formulario, Date.now());
        actualizarCamposCondicionais(formulario);

        if (!mostrarConfirmacionModal(formulario, xustificante)) {
          mostrarEstado(
            formulario,
            resultado.idSolicitude
              ? `Solicitude recibida correctamente. Referencia: ${resultado.idSolicitude}`
              : 'Solicitude recibida correctamente.',
            'success'
          );
        }
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

      restablecerModal(selector);
      const tipo = boton.dataset.selectSolicitude || '';
      const campoTipo = selector.elements.tipoSolicitude;
      if (campoTipo) {
        campoTipo.value = tipo;
        campoTipo.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const modal = modais.get(selector);
      if (modal && !modal.open) modal.showModal();
      window.setTimeout(() => selector.elements.nomeCompleto?.focus(), 80);
    });
  });
})();
