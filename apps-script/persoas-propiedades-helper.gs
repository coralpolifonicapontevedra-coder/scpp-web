/*
 * Helper mínimo para Administración > Persoas.
 * Resolve propiedades obrigatorias do proxecto Apps Script sen depender
 * doutros módulos.
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
