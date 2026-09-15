/**
 * Hace accesibles con enlace todas las fotografías
 * de la carpeta Fotos_Images.
 *
 * Ejecutar manualmente una sola vez.
 */

function facerPublicasFotosDrive() {
  const folderId =
    '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix';

  const carpeta =
    DriveApp.getFolderById(folderId);

  const ficheiros =
    carpeta.getFiles();

  let total = 0;
  let actualizados = 0;
  let erros = 0;

  while (ficheiros.hasNext()) {
    const ficheiro = ficheiros.next();
    total += 1;

    try {
      ficheiro.setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW
      );

      actualizados += 1;

      console.log(
        'Permiso actualizado: ' +
        ficheiro.getName()
      );
    } catch (erro) {
      erros += 1;

      console.error(
        'Erro en ' +
        ficheiro.getName() +
        ': ' +
        String(
          erro && erro.message
            ? erro.message
            : erro
        )
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        carpeta: carpeta.getName(),
        total: total,
        actualizados: actualizados,
        erros: erros
      },
      null,
      2
    )
  );
}