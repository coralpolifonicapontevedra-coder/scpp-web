function probarPostAceptacion() {
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

  console.log(
    resposta.getContent()
  );
}

function diagnosticarAccesoMhm() {
  const correo = obterPropiedadeObrigatoria_('WEB_TEST_EMAIL');

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
