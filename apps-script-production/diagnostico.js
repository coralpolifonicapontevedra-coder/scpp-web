function corrixirUsuariosWebPortal() {
  const idCorrecto =
    '1anry8OEiJ5EuZ-LZtz0QM_13uHj3wn2KXnamXs7f8KI';

  PropertiesService
    .getScriptProperties()
    .setProperty(
      'USUARIOS_WEB_SPREADSHEET_ID',
      idCorrecto
    );

  const usuario = buscarUsuarioWebPorEmail_(
    'jcuinas@gmail.com'
  );

  console.log(JSON.stringify(usuario));
}