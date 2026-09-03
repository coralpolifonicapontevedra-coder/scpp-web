/* Alta por invitación de Persoas · Preview.
 * Crea unha fila real sen apelido técnico e permite borrar rexistros de proba/erro.
 */

function crearPersoaInvitacionAdministracion_(datos) {
  try {
    validarAccionPermitidaEntorno_('crearPersoaAdministracion');

    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const contexto = obterContextoPersoasAdmin_();
    const valores = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    const cabeceiras = valores[0] || [];
    const indices = indicesPersoasAdmin_(cabeceiras);
    ['Row ID', 'Id', 'Nome', 'Correo electrónico', 'Teléfono', 'Activo'].forEach(function(cabeceira) {
      requireHeaderPersoasAdmin_(indices, cabeceira, 'Persoas');
    });

    const entrada = datos && datos.persoa && typeof datos.persoa === 'object'
      ? datos.persoa
      : (datos || {});
    const nome = textoPersoasAdmin_(entrada.nome || entrada.Nome);
    const correo = normalizarEmailPersoasAdmin_(entrada.correo || entrada.email || entrada['Correo electrónico']);
    const telefono = textoPersoasAdmin_(entrada.telefono || entrada['Teléfono']);

    if (!nome || !correo || !telefono) {
      return { ok: false, erro: 'Nome, correo e teléfono son obrigatorios para a alta por invitación' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return { ok: false, erro: 'O correo electrónico non é válido' };
    }

    const conflito = detectarDuplicadoPersoaAdmin_(valores, indices, { correo: correo }, '');
    if (conflito) return { ok: false, erro: conflito };

    const fila = new Array(cabeceiras.length).fill('');
    const novoId = seguinteIdPersoaAdmin_(valores, indices);
    const rowId = Utilities.getUuid();

    poñerValorPersoaAdmin_(fila, indices, 'Row ID', rowId);
    poñerValorPersoaAdmin_(fila, indices, 'Id', novoId);
    poñerValorPersoaAdmin_(fila, indices, 'Nome', nome);
    poñerValorPersoaAdmin_(fila, indices, 'Correo electrónico', correo);
    poñerValorPersoaAdmin_(fila, indices, 'Teléfono', telefono);
    poñerValorPersoaAdmin_(fila, indices, 'Activo', 'Y');
    if (indices.MostrarWeb !== undefined) poñerValorPersoaAdmin_(fila, indices, 'MostrarWeb', 'N');
    if (indices.MostrarAniversario !== undefined) poñerValorPersoaAdmin_(fila, indices, 'MostrarAniversario', 'N');
    if (indices.EstadoAlta !== undefined) poñerValorPersoaAdmin_(fila, indices, 'EstadoAlta', 'PENDENTE');
    if (indices.ObservacionsPrivadas !== undefined) {
      poñerValorPersoaAdmin_(fila, indices, 'ObservacionsPrivadas', 'Alta por invitación pendente de completar');
    }
    poñerValorPersoaAdmin_(fila, indices, 'DataActualizacionPerfil', new Date());
    poñerValorPersoaAdmin_(fila, indices, 'ActualizadoPor', administrador.email);
    actualizarNomeCompletoPersoaAdmin_(fila, indices);

    contexto.persoas.appendRow(fila);
    SpreadsheetApp.flush();

    return {
      ok: true,
      mensaxe: 'Alta por invitación creada correctamente',
      idPersoa: String(novoId),
      rowId: rowId,
      estadoAlta: indices.EstadoAlta !== undefined ? 'PENDENTE' : '',
      persoa: construirPersoaAdmin_(fila, indices)
    };
  } catch (erro) {
    console.error('Erro en crearPersoaInvitacionAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok: false, erro: erro && erro.message ? String(erro.message) : String(erro) };
  }
}

function listarEstadosAltaPersoasAdministracion_(datos) {
  try {
    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const contexto = obterContextoPersoasAdmin_();
    const valores = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };
    if (valores.length < 2) return { ok: true, estados: [] };

    const indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');

    const estados = valores.slice(1).map(function(fila) {
      const idPersoa = textoPersoasAdmin_(fila[indices.Id]);
      const rowId = indices['Row ID'] === undefined ? '' : textoPersoasAdmin_(fila[indices['Row ID']]);
      let estadoAlta = 'COMPLETA';
      if (indices.EstadoAlta !== undefined) {
        const valor = textoPersoasAdmin_(fila[indices.EstadoAlta]);
        if (valor === 'PENDENTE' || valor === 'COMPLETA') estadoAlta = valor;
      } else if (
        indices.ObservacionsPrivadas !== undefined &&
        /alta por invitación pendente/i.test(textoPersoasAdmin_(fila[indices.ObservacionsPrivadas]))
      ) {
        estadoAlta = 'PENDENTE';
      }
      return { idPersoa: idPersoa, rowId: rowId, estadoAlta: estadoAlta };
    }).filter(function(item) {
      return item.idPersoa || item.rowId;
    });

    return { ok: true, estados: estados };
  } catch (erro) {
    console.error('Erro en listarEstadosAltaPersoasAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok: false, erro: erro && erro.message ? String(erro.message) : String(erro) };
  }
}

function completarAltaPersoaAdministracion_(datos) {
  try {
    validarAccionPermitidaEntorno_('actualizarPersoaAdministracion');

    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok: false, erro: 'Non se indicou a persoa' };

    const contexto = obterContextoPersoasAdmin_();
    const valores = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    const indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');

    const indiceFila = persoasNovoAtoparFila_(valores, indices, referencia);
    if (indiceFila < 1) return { ok: false, erro: 'Non se atopou a persoa solicitada' };

    const fila = valores[indiceFila].slice();
    if (indices.EstadoAlta !== undefined) {
      const actual = textoPersoasAdmin_(fila[indices.EstadoAlta]);
      if (actual === 'COMPLETA') {
        return { ok: true, idPersoa: textoPersoasAdmin_(fila[indices.Id]), estadoAlta: 'COMPLETA', existente: true };
      }
      poñerValorPersoaAdmin_(fila, indices, 'EstadoAlta', 'COMPLETA');
    }
    if (indices.ObservacionsPrivadas !== undefined) {
      const observacions = textoPersoasAdmin_(fila[indices.ObservacionsPrivadas]);
      if (/^Alta por invitación pendente de completar$/i.test(observacions)) {
        poñerValorPersoaAdmin_(fila, indices, 'ObservacionsPrivadas', '');
      }
    }
    poñerValorPersoaAdmin_(fila, indices, 'DataActualizacionPerfil', new Date());
    poñerValorPersoaAdmin_(fila, indices, 'ActualizadoPor', administrador.email);

    contexto.persoas.getRange(indiceFila + 1, 1, 1, fila.length).setValues([fila]);
    SpreadsheetApp.flush();

    return {
      ok: true,
      idPersoa: textoPersoasAdmin_(fila[indices.Id]),
      estadoAlta: 'COMPLETA',
      existente: false
    };
  } catch (erro) {
    console.error('Erro en completarAltaPersoaAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok: false, erro: erro && erro.message ? String(erro.message) : String(erro) };
  }
}

function eliminarPersoaAdministracion_(datos) {
  try {
    validarAccionPermitidaEntorno_('actualizarPersoaAdministracion');

    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok: false, erro: 'Non se indicou a persoa' };

    const contexto = obterContextoPersoasAdmin_();
    const valores = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    const indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');
    const indiceFila = persoasNovoAtoparFila_(valores, indices, referencia);
    if (indiceFila < 1) return { ok: false, erro: 'Non se atopou a persoa solicitada' };

    const fila = valores[indiceFila];
    const correoPersoa = indices['Correo electrónico'] === undefined
      ? ''
      : normalizarEmailPersoasAdmin_(fila[indices['Correo electrónico']]);
    if (correoPersoa && correoPersoa === email) {
      return { ok: false, erro: 'Non podes eliminar a túa propia ficha administrativa.' };
    }

    const idPersoa = textoPersoasAdmin_(fila[indices.Id]);
    const nomeCompleto = indices.Nomecompleto !== undefined
      ? textoPersoasAdmin_(fila[indices.Nomecompleto])
      : (indices.NomeCompleto !== undefined ? textoPersoasAdmin_(fila[indices.NomeCompleto]) : '');

    contexto.persoas.deleteRow(indiceFila + 1);
    SpreadsheetApp.flush();

    return {
      ok: true,
      idPersoa: idPersoa,
      nomeCompleto: nomeCompleto,
      mensaxe: 'Rexistro eliminado da folla Persoas.'
    };
  } catch (erro) {
    console.error('Erro en eliminarPersoaAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok: false, erro: erro && erro.message ? String(erro.message) : String(erro) };
  }
}
