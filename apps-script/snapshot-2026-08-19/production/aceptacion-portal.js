function probarEscrituraAceptacion() {
  const propiedades =
    PropertiesService.getScriptProperties();

  const correo = String(
    propiedades.getProperty('WEB_TEST_EMAIL') || ''
  )
    .trim()
    .toLowerCase();

  const libroUsuarios =
    SpreadsheetApp.getActiveSpreadsheet();

  const follaUsuarios =
    libroUsuarios.getSheetByName('UsuariosWeb');

  if (!follaUsuarios) {
    throw new Error(
      'Non se atopou a pestana UsuariosWeb'
    );
  }

  const valores =
    follaUsuarios.getDataRange().getValues();

  if (valores.length < 2) {
    throw new Error(
      'Non hai usuarios rexistrados'
    );
  }

  const cabeceiras = valores[0].map(valor =>
    String(valor).trim()
  );

  const columnaRowId =
    cabeceiras.indexOf('Row ID');

  const columnaPersoa =
    cabeceiras.indexOf('Persoa');

  const columnaEmail =
    cabeceiras.indexOf('Email');

  if (
    columnaRowId === -1 ||
    columnaPersoa === -1 ||
    columnaEmail === -1
  ) {
    throw new Error(
      'Faltan as columnas Row ID, Persoa ou Email'
    );
  }

  const filaUsuario = valores.find(
    (fila, indice) =>
      indice > 0 &&
      String(fila[columnaEmail])
        .trim()
        .toLowerCase() === correo
  );

  if (!filaUsuario) {
    throw new Error(
      'Non se atopou o usuario de proba'
    );
  }

  rexistrarAceptacion({
    email: correo,
    version: 'PROBA-TECNICA',
    textoLegal:
      'Rexistro creado unicamente para comprobar o funcionamento técnico.',
    aceptaFines: false,
    persoa: String(
      filaUsuario[columnaPersoa] || ''
    ).trim(),
    usuarioWeb: String(
      filaUsuario[columnaRowId] || ''
    ).trim(),
    ambito:
      'coralpolifonicapontevedra.org',
    canle: 'Web',
    dataRetirada: ''
  });
}
function obterUsuarioWebPorEmail(correo) {
  const libroUsuarios =
    SpreadsheetApp.getActiveSpreadsheet();

  const follaUsuarios =
    libroUsuarios.getSheetByName('UsuariosWeb');

  if (!follaUsuarios) {
    throw new Error(
      'Non se atopou a pestana UsuariosWeb'
    );
  }

  const valores =
    follaUsuarios.getDataRange().getValues();

  if (valores.length < 2) {
    throw new Error(
      'Non hai usuarios rexistrados'
    );
  }

  const cabeceiras = valores[0].map(valor =>
    String(valor).trim()
  );

  const columnaRowId =
    cabeceiras.indexOf('Row ID');

  const columnaPersoa =
    cabeceiras.indexOf('Persoa');

  const columnaEmail =
    cabeceiras.indexOf('Email');

  if (
    columnaRowId === -1 ||
    columnaPersoa === -1 ||
    columnaEmail === -1
  ) {
    throw new Error(
      'Faltan as columnas Row ID, Persoa ou Email en UsuariosWeb'
    );
  }

  const filaUsuario = valores.find(
    (fila, indice) =>
      indice > 0 &&
      String(fila[columnaEmail] || '')
        .trim()
        .toLowerCase() === correo
  );

  if (!filaUsuario) {
    throw new Error(
      'Non se atopou o usuario en UsuariosWeb'
    );
  }

  const persoa = String(
    filaUsuario[columnaPersoa] || ''
  ).trim();

  const usuarioWeb = String(
    filaUsuario[columnaRowId] || ''
  ).trim();

  if (!persoa || !usuarioWeb) {
    throw new Error(
      'O usuario non ten Persoa ou Row ID correctamente cubertos'
    );
  }

  return {
    persoa: persoa,
    usuarioWeb: usuarioWeb
  };
}
