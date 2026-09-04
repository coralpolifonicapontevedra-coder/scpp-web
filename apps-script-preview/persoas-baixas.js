/* Administración > Persoas > Baixas · Preview.
 * A baixa funcional non elimina a persoa: marca Activo=N e crea historial en BaixasSocios.
 * A reactivación só devolve Activo=Y; o historial de baixas consérvase.
 */

var PERSOAS_BAIXAS_PREVIEW_CONFIG_ = {
  spreadsheetId: '1S0aa-8LXpANbDWGKj9jNDB-YStTgzNHxPUbTjoZFt2w',
  sheetName: 'BaixasSocios'
};

function cambiarEstadoPersoaConBaixaAdministracion_(datos) {
  var bloqueo = LockService.getScriptLock();
  try {
    validarAccionPermitidaEntorno_('actualizarPersoaAdministracion');
    bloqueo.waitLock(10000);

    var email = normalizarEmailPersoasAdmin_(datos && datos.email);
    var referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok:false, erro:'Non se indicou a persoa' };

    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok:false, erro:'Usuario non autorizado' };

    var indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');
    requireHeaderPersoasAdmin_(indices, 'Activo', 'Persoas');

    var indiceFila = persoasNovoAtoparFila_(valores, indices, referencia);
    if (indiceFila < 1) return { ok:false, erro:'Non se atopou a persoa' };

    var fila = valores[indiceFila].slice();
    var idPersoa = textoPersoasAdmin_(fila[indices.Id]);
    var activo = datos && datos.activo === true;

    if (!activo) {
      var baixas = SpreadsheetApp
        .openById(PERSOAS_BAIXAS_PREVIEW_CONFIG_.spreadsheetId)
        .getSheetByName(PERSOAS_BAIXAS_PREVIEW_CONFIG_.sheetName);
      if (!baixas) throw new Error('Non se atopou a folla BaixasSocios de Preview');

      var valoresBaixas = baixas.getDataRange().getValues();
      var cabeceirasBaixas = valoresBaixas[0] || [];
      var ib = indicesPersoasAdmin_(cabeceirasBaixas);
      ['Id','Socio','Data de baixa','Motivo','Observacións'].forEach(function(c) {
        requireHeaderPersoasAdmin_(ib, c, 'BaixasSocios');
      });

      var motivo = textoPersoasAdmin_(datos && datos.motivoBaixa) || 'Baixa rexistrada desde administración web';
      var observacions = textoPersoasAdmin_(datos && datos.observacionsBaixa);
      var dataBaixa = dataBaixaPersoasAdmin_(datos && datos.dataBaixa);
      var filaBaixa = new Array(cabeceirasBaixas.length).fill('');
      filaBaixa[ib.Id] = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      filaBaixa[ib.Socio] = idPersoa;
      filaBaixa[ib['Data de baixa']] = dataBaixa;
      filaBaixa[ib.Motivo] = motivo;
      filaBaixa[ib['Observacións']] = observacions;

      baixas.appendRow(filaBaixa);
    }

    persoasNovoPoñer_(fila, indices, 'Activo', activo ? 'Y' : 'N');
    persoasNovoPoñer_(fila, indices, 'DataActualizacionPerfil', new Date());
    persoasNovoPoñer_(fila, indices, 'ActualizadoPor', administrador.email);
    contexto.persoas.getRange(indiceFila + 1, 1, 1, fila.length).setValues([fila]);
    SpreadsheetApp.flush();

    return {
      ok:true,
      idPersoa:idPersoa,
      activo:activo,
      mensaxe: activo ? 'Persoa reactivada. O historial de baixas consérvase.' : 'Baixa rexistrada en Persoas e BaixasSocios.',
      persoa:construirPersoaAdmin_(fila, indices)
    };
  } catch (erro) {
    console.error('Erro en cambiarEstadoPersoaConBaixaAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  } finally {
    try { if (bloqueo.hasLock()) bloqueo.releaseLock(); } catch (_) {}
  }
}

function dataBaixaPersoasAdmin_(valor) {
  var texto = textoPersoasAdmin_(valor);
  if (!texto) return new Date();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  var d = new Date(texto);
  return isNaN(d.getTime()) ? new Date() : d;
}
