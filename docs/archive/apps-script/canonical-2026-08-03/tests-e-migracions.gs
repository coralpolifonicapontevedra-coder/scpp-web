/**
 * PROBAS, DIAGNÓSTICOS E MIGRACIÓNS HISTÓRICAS.
 *
 * Non forma parte do fluxo ordinario de produción.
 * Revisar cada función antes de executala.
 */

function corrixirUsuariosWebPortal() {
  const idCorrecto =
    '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8';

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

function probarPostAceptacionDiagnostico() {
  const propiedades =
    PropertiesService.getScriptProperties();

  const token =
    propiedades.getProperty('WEB_WRITE_TOKEN');

  const correo = String(
    propiedades.getProperty('WEB_TEST_EMAIL') || ''
  )
    .trim()
    .toLowerCase();

  const eventoSimulado = {
    postData: {
      contents: JSON.stringify({
        token: token,
        accion: 'rexistrarAceptacion',
        email: correo,
        version: 'PRIVACIDADE-WEB-1.0',
        textoLegal:
          'Texto de proba da aceptación da política de privacidade.',
        aceptaFines: true,
        persoa: '',
        usuarioWeb: '',
        ambito:
          'coralpolifonicapontevedra.org'
      })
    }
  };

  const resposta = doPost(eventoSimulado);
  console.log(resposta.getContent());
}

function diagnosticarAccesoMhm() {
  const correo = 'mhm36002@gmail.com';

  console.log(
    'UsuariosWeb: ' +
    JSON.stringify(
      buscarUsuarioWebPorEmail_(correo)
    )
  );

  console.log(
    'Persoa activa: ' +
    JSON.stringify(
      obterPersoaActivaPorEmail_(correo)
    )
  );
}

/**
 * OBSOLETO. Non executar.
 * Facía accesibles con enlace todas as fotografías de Fotos_Images.
 */
function facerPublicasFotosDrive() {
  const folderId =
    '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix';

  const carpeta = DriveApp.getFolderById(folderId);
  const ficheiros = carpeta.getFiles();

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
      console.log('Permiso actualizado: ' + ficheiro.getName());
    } catch (erro) {
      erros += 1;
      console.error(
        'Erro en ' +
        ficheiro.getName() +
        ': ' +
        String(erro && erro.message ? erro.message : erro)
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
