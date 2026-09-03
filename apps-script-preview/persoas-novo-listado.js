function persoasNovoListarCompleto_(datos) {
  var resultado = listarPersoasAdministracion_(datos || {});
  if (!resultado || resultado.ok !== true) return resultado;
  try { resultado.textoLegalPersoas = obterTextoLegalPersoasAdmin_(); }
  catch (erroLegal) { resultado.textoLegalErro = String(erroLegal && erroLegal.message ? erroLegal.message : erroLegal); }
  try {
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var indices = indicesPersoasAdmin_(valores[0] || []);
    if (indices.EstadoAlta !== undefined) {
      var estados = {};
      for (var i=1;i<valores.length;i++) {
        var id = indices.Id===undefined?'':textoPersoasAdmin_(valores[i][indices.Id]);
        var row = indices['Row ID']===undefined?'':textoPersoasAdmin_(valores[i][indices['Row ID']]);
        var estado = textoPersoasAdmin_(valores[i][indices.EstadoAlta]) || 'COMPLETA';
        if (id) estados[id]=estado;
        if (row) estados[row]=estado;
      }
      (resultado.persoas || []).forEach(function(p){ p.estadoAlta = estados[String(p.idPersoa||p.id||p.rowId||'')] || 'COMPLETA'; });
    }
  } catch (erroEstado) { console.warn('Non se puido completar EstadoAlta:', erroEstado); }
  return resultado;
}
