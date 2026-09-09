function comprobarAdministradorFotos() {
  const correo = 'jcuinas@gmail.com';

  console.log(
    'UsuarioWeb: ' +
    JSON.stringify(buscarUsuarioWebPorEmail_(correo))
  );

  console.log(
    'Administrador Fotos: ' +
    JSON.stringify(obterAdministradorFotos_(correo))
  );
}