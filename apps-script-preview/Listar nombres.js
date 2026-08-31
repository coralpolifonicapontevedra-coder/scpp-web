function listarNomesPropiedades() {
  const props = PropertiesService.getScriptProperties().getProperties();
  console.log(Object.keys(props).sort().join('\n'));
}