function comprobarAdministradorFotos() {
  const correo = 'secretario@coralpolifonicapontevedra.org';

  console.log(
    'UsuarioWeb: ' +
    JSON.stringify(buscarUsuarioWebPorEmail_(correo))
  );

  console.log(
    'Administrador Fotos: ' +
    JSON.stringify(obterAdministradorFotos_(correo))
  );
}