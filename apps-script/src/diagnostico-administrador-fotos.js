function comprobarAdministradorFotos() {
  const correo = obterPropiedadeObrigatoria_('WEB_TEST_EMAIL');

  console.log(
    'UsuarioWeb: ' +
    JSON.stringify(buscarUsuarioWebPorEmail_(correo))
  );

  console.log(
    'Administrador Fotos: ' +
    JSON.stringify(obterAdministradorFotos_(correo))
  );
}
