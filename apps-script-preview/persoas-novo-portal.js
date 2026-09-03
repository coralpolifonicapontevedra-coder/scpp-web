/* Persoas novo: escrituras xa autorizadas por Cloudflare /api/portal-access.
 * Apps Script non volve decidir permisos; WEB_WRITE_TOKEN segue protexendo o Web App.
 */
function persoasNovoActorPortal_(datos) {
  return { email: normalizarEmailPersoasAdmin_(datos && datos.email) };
}

function persoasNovoCrearPortal_(datos) {
  try {
    var actor = persoasNovoActorPortal_(datos);
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var cabeceiras = valores[0] || [];
    var indices = indicesPersoasAdmin_(cabeceiras);
    ['Row ID','Id','Nome','Primeiro apelido','Activo'].forEach(function(c){ requireHeaderPersoasAdmin_(indices,c,'Persoas'); });

    var entrada = persoasNovoLimparEntrada_(datos && (datos.persoa || datos.datos || {}));
    var invitacion = datos && datos.modo === 'invitacion';
    if (!entrada.nome) return { ok:false, erro:'O nome é obrigatorio' };
    if (!invitacion && !entrada.primeiroApelido) return { ok:false, erro:'O primeiro apelido é obrigatorio' };
    if (invitacion && !entrada.correo) return { ok:false, erro:'O correo é obrigatorio para unha invitación' };

    var conflito = persoasNovoDuplicado_(valores, indices, entrada, '');
    if (conflito) return { ok:false, erro:conflito };

    var fila = new Array(cabeceiras.length).fill('');
    var novoId = persoasNovoSeguinteId_(valores, indices);
    var rowId = Utilities.getUuid();
    persoasNovoPoñer_(fila, indices, 'Row ID', rowId);
    persoasNovoPoñer_(fila, indices, 'Id', novoId);
    persoasNovoAplicar_(fila, indices, entrada, true);
    persoasNovoPoñer_(fila, indices, 'Activo', 'Y');
    persoasNovoPoñer_(fila, indices, 'DataActualizacionPerfil', new Date());
    persoasNovoPoñer_(fila, indices, 'ActualizadoPor', actor.email);
    if (indices.EstadoAlta !== undefined) fila[indices.EstadoAlta] = invitacion ? 'PENDENTE' : 'COMPLETA';
    persoasNovoNomeCompleto_(fila, indices);
    contexto.persoas.appendRow(fila);
    SpreadsheetApp.flush();
    return { ok:true, idPersoa:String(novoId), rowId:rowId, estadoAlta:invitacion?'PENDENTE':'COMPLETA', persoa:construirPersoaAdmin_(fila,indices) };
  } catch (erro) {
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasNovoActualizarPortal_(datos) {
  try {
    var actor = persoasNovoActorPortal_(datos);
    var referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok:false, erro:'Non se indicou a persoa' };
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var indices = indicesPersoasAdmin_(valores[0] || []);
    var indiceFila = persoasNovoAtoparFila_(valores, indices, referencia);
    if (indiceFila < 1) return { ok:false, erro:'Non se atopou a persoa' };

    var entrada = persoasNovoLimparEntrada_(datos && (datos.persoa || datos.datos || {}));
    var idActual = textoPersoasAdmin_(valores[indiceFila][indices.Id]);
    var conflito = persoasNovoDuplicado_(valores, indices, entrada, idActual);
    if (conflito) return { ok:false, erro:conflito };

    var fila = valores[indiceFila].slice();
    persoasNovoAplicar_(fila, indices, entrada, false);
    persoasNovoNomeCompleto_(fila, indices);
    persoasNovoPoñer_(fila, indices, 'DataActualizacionPerfil', new Date());
    persoasNovoPoñer_(fila, indices, 'ActualizadoPor', actor.email);

    var aceptacionRexistrada = null;
    if (datos && datos.aceptacion) {
      var aceptacion = persoasNovoValidarAceptacion_(datos.aceptacion);
      aceptacionRexistrada = persoasNovoRexistrarAceptacion_(contexto, actor, fila, indices, idActual, aceptacion);
    }
    if (indices.EstadoAlta !== undefined && datos && datos.completarAlta === true) fila[indices.EstadoAlta] = 'COMPLETA';
    contexto.persoas.getRange(indiceFila + 1,1,1,fila.length).setValues([fila]);
    SpreadsheetApp.flush();
    return { ok:true, idPersoa:idActual, persoa:construirPersoaAdmin_(fila,indices), aceptacion:aceptacionRexistrada };
  } catch (erro) {
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasNovoEstadoPortal_(datos) {
  try {
    var actor = persoasNovoActorPortal_(datos);
    var referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var indices = indicesPersoasAdmin_(valores[0] || []);
    var indiceFila = persoasNovoAtoparFila_(valores, indices, referencia);
    if (indiceFila < 1) return { ok:false, erro:'Non se atopou a persoa' };
    var fila = valores[indiceFila].slice();
    var activo = datos && datos.activo === true;
    persoasNovoPoñer_(fila, indices, 'Activo', activo ? 'Y' : 'N');
    persoasNovoPoñer_(fila, indices, 'DataActualizacionPerfil', new Date());
    persoasNovoPoñer_(fila, indices, 'ActualizadoPor', actor.email);
    contexto.persoas.getRange(indiceFila + 1,1,1,fila.length).setValues([fila]);
    SpreadsheetApp.flush();
    return { ok:true, idPersoa:textoPersoasAdmin_(fila[indices.Id]), activo:activo, persoa:construirPersoaAdmin_(fila,indices) };
  } catch (erro) {
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}