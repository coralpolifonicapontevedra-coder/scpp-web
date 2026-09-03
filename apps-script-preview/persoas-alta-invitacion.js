/* Alta por invitación de Persoas · Preview.
 * Crea unha fila real sen apelido técnico e xestiona EstadoAlta.
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
    ['Row ID', 'Id', 'Nome', 'Correo electrónico', 'Teléfono', 'Activo', 'EstadoAlta'].forEach(function(cabeceira) {
      requireHeaderPersoasAdmin_(indices, cabeceira, 'Persoas');
    });

    const nome = textoPersoasAdmin_(datos && datos.nome);
    const correo = normalizarEmailPersoasAdmin_(datos && datos.correo);
    const telefono = textoPersoasAdmin_(datos && datos.telefono);
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
    poñerValorPersoaAdmin_(fila, indices, 'EstadoAlta', 'PENDENTE');
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
      estadoAlta: 'PENDENTE',
      persoa: construirPersoaAdmin_(fila, indices)
    };
  } catch (erro) {
    console.error('Erro en crearPersoaInvitacionAdministracion_:', erro && erro.stack ? erro.stack : erro);
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
    requireHeaderPersoasAdmin_(indices, 'EstadoAlta', 'Persoas');

    const indiceFila = atoparIndiceFilaPersoaAdmin_(valores, indices, referencia);
    if (indiceFila < 1) return { ok: false, erro: 'Non se atopou a persoa solicitada' };

    const fila = valores[indiceFila].slice();
    const actual = textoPersoasAdmin_(fila[indices.EstadoAlta]);
    if (actual === 'COMPLETA') {
      return { ok: true, idPersoa: textoPersoasAdmin_(fila[indices.Id]), estadoAlta: 'COMPLETA', existente: true };
    }

    poñerValorPersoaAdmin_(fila, indices, 'EstadoAlta', 'COMPLETA');
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
