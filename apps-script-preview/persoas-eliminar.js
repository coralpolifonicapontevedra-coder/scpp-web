/*
 * Eliminación física dunha alta errónea en Administración > Persoas.
 * Só elimina a fila de Persoas. A limpeza dos obxectos R2 execútase no Worker.
 *
 * Proteccións:
 * - require conta administradora;
 * - non permite eliminar o propio rexistro do administrador;
 * - non permite eliminar se xa existe UsuarioWeb;
 * - non permite eliminar se xa existe unha aceptación legal.
 */

function eliminarPersoaAdministracion_(datos) {
  try {
    var emailAdmin = normalizarEmailPersoasAdmin_(datos && datos.email);
    var referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok:false, codigo:'PERSOA_REQUIRED', erro:'Non se indicou a persoa' };

    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var administrador = obterAdministradorPersoasAdmin_(contexto, emailAdmin, valores);
    if (!administrador) return { ok:false, codigo:'FORBIDDEN', erro:'Usuario non autorizado' };

    var indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');

    var indiceFila = persoasNovoAtoparFila_(valores, indices, referencia);
    if (indiceFila < 1) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou a persoa solicitada' };

    var fila = valores[indiceFila];
    var idPersoa = textoPersoasAdmin_(fila[indices.Id]);
    var rowId = indices['Row ID'] === undefined ? '' : textoPersoasAdmin_(fila[indices['Row ID']]);
    var correo = indices['Correo electrónico'] === undefined ? '' : normalizarEmailPersoasAdmin_(fila[indices['Correo electrónico']]);
    var nome = [
      indices.Nome === undefined ? '' : textoPersoasAdmin_(fila[indices.Nome]),
      indices['Primeiro apelido'] === undefined ? '' : textoPersoasAdmin_(fila[indices['Primeiro apelido']]),
      indices['Segundo apelido'] === undefined ? '' : textoPersoasAdmin_(fila[indices['Segundo apelido']])
    ].filter(Boolean).join(' ');

    if (correo && correo === emailAdmin) {
      return {
        ok:false,
        codigo:'SELF_DELETE_BLOCKED',
        erro:'Non podes eliminar desde aquí o teu propio rexistro de Persoas.'
      };
    }

    if (tenUsuarioWebPersoaEliminar_(contexto, idPersoa, rowId, correo)) {
      return {
        ok:false,
        codigo:'HAS_USUARIO_WEB',
        erro:'Esta persoa xa ten un UsuarioWeb asociado. Para conservar a integridade do historial debes tramitar unha baixa, non eliminar o rexistro.'
      };
    }

    if (tenAceptacionPersoaEliminar_(idPersoa)) {
      return {
        ok:false,
        codigo:'HAS_ACCEPTANCE',
        erro:'Esta persoa xa ten unha aceptación legal rexistrada. Para conservar a evidencia e o historial debes tramitar unha baixa, non eliminar o rexistro.'
      };
    }

    var fichaR2Key = indices.FichaR2Key === undefined ? '' : textoPersoasAdmin_(fila[indices.FichaR2Key]);
    var estadoAlta = indices.EstadoAlta === undefined ? '' : textoPersoasAdmin_(fila[indices.EstadoAlta]);

    contexto.persoas.deleteRow(indiceFila + 1);
    SpreadsheetApp.flush();

    return {
      ok:true,
      mensaxe:'Rexistro de Persoas eliminado da Sheet. Procedendo coa limpeza de R2.',
      idPersoa:idPersoa,
      rowId:rowId,
      nome:nome,
      correo:correo,
      estadoAlta:estadoAlta,
      fichaR2Key:fichaR2Key
    };
  } catch (erro) {
    console.error('Erro en eliminarPersoaAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return {
      ok:false,
      codigo:'DELETE_ERROR',
      erro:erro && erro.message ? String(erro.message) : String(erro)
    };
  }
}

function tenUsuarioWebPersoaEliminar_(contexto, idPersoa, rowId, correo) {
  if (!contexto || !contexto.usuarios) return false;
  var valores = contexto.usuarios.getDataRange().getValues();
  if (valores.length < 2) return false;
  var indices = indicesPersoasAdmin_(valores[0] || []);

  for (var i = 1; i < valores.length; i += 1) {
    var fila = valores[i];
    var persoa = indices.Persoa === undefined ? '' : textoPersoasAdmin_(fila[indices.Persoa]);
    var email = indices.Email === undefined ? '' : normalizarEmailPersoasAdmin_(fila[indices.Email]);
    if ((idPersoa && persoa === idPersoa) || (rowId && persoa === rowId) || (correo && email === correo)) return true;
  }
  return false;
}

function tenAceptacionPersoaEliminar_(idPersoa) {
  if (!idPersoa) return false;
  var contexto = contextoAceptacionPersoasAdmin_();
  var valores = contexto.aceptacion.getDataRange().getValues();
  if (valores.length < 2) return false;
  var indices = indicesPersoasAdmin_(valores[0] || []);
  if (indices.Persoa === undefined) return false;

  for (var i = 1; i < valores.length; i += 1) {
    if (textoPersoasAdmin_(valores[i][indices.Persoa]) === idPersoa) return true;
  }
  return false;
}
