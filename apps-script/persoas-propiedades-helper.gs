/*
 * Helpers mínimos de ambiente para Administración > Persoas.
 * Mantén en Produción as mesmas funcións comúns que usa Preview,
 * sen incorporar módulos alleos a Persoas.
 */
function obterPropiedadeObrigatoria_(nome) {
  const chave = String(nome || '').trim();
  if (!chave) throw new Error('Nome de propiedade non válido');

  const valor = String(
    PropertiesService.getScriptProperties().getProperty(chave) || ''
  ).trim();

  if (!valor) {
    throw new Error('Falta a propiedade obrigatoria: ' + chave);
  }

  return valor;
}

function obterPropiedadeOpcional_(nome, valorPorDefecto) {
  const chave = String(nome || '').trim();
  const valor = String(
    PropertiesService.getScriptProperties().getProperty(chave) || ''
  ).trim();
  return valor || String(valorPorDefecto == null ? '' : valorPorDefecto);
}

function obterAmbienteSCPP_() {
  let ambiente = obterPropiedadeObrigatoria_('SCPP_ENVIRONMENT').toLowerCase();
  if (ambiente === 'test') ambiente = 'preview';
  if (['preview', 'production'].indexOf(ambiente) === -1) {
    throw new Error('SCPP_ENVIRONMENT debe ser preview ou production');
  }
  return ambiente;
}

function validarAccionPermitidaEntorno_(accion) {
  const ambiente = obterAmbienteSCPP_();
  const escribe = /^(rexistrar|actualizar|subir|gardar|eliminar|publicar|crear|borrar|editar|sincronizar)/i.test(
    String(accion || '').trim()
  );
  if (!escribe) return;

  const permiteEscritura = String(
    PropertiesService.getScriptProperties().getProperty('SCPP_ALLOW_WRITES') || ''
  ).toLowerCase() === 'true';

  if (!permiteEscritura) {
    throw new Error('Escritura desactivada no ambiente ' + ambiente);
  }
}
