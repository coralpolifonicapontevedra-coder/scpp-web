/*
 * Módulo do Apps Script para o Portal > Documentación.
 *
 * Versión independente do ficheiro activo:
 * abre explicitamente Documentación, Actas, UsuariosWeb e Persoas.
 * Emprega Id_Documento, Id_Actas e Persoas.Id, sen depender de Row ID.
 */

const DOC_PORTAL_CONFIG = {
  documentosSpreadsheetId:
    '1sAMi9TWZ7YwjOxu1a-KliO_7LtYlo4Zf2AowmPKDQX8',

  sheetDocumentacion:
    'Documentación',

  sheetActas:
    'Actas XD e AX',

  usuariosSpreadsheetId:
    '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',

  usuariosSheetId:
    1291817000,

  persoasSpreadsheetId:
    '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',

  persoasSheetId:
    388888827,

  folderDocumentacionId:
    '1T8izGJMWiWH0cSNHyKIDvSQZXtB2LgyQ',

  folderActasId:
    '1dJpIGV-i6kvu6gTkeTphpz9uopvHO2MR'
};

const DOC_NIVEIS = {
  Coralistas: 1,
  'Xunta Directiva': 2,
  Administración: 3
};

function probarDocumentacionPortal() {
  const resultado = listarDocumentacionPortal_({
    email: 'jcuinas@gmail.com'
  });
  console.log(JSON.stringify(resultado));
}

function listarDocumentacionPortal_(datos) {
  const email = normalizarEmailDoc_(datos && datos.email);
  const contexto = obterContextoDocumentacion_();
  const perfil = obterPerfilDocumentacion_(contexto, email);

  if (!perfil) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  const documentos = [];

  documentos.push.apply(
    documentos,
    lerDocumentosXerais_(contexto.documentos, perfil)
  );

  documentos.push.apply(
    documentos,
    lerActas_(contexto.actas, perfil)
  );

  documentos.sort(function(a, b) {
    const seccion = String(a.seccion).localeCompare(
      String(b.seccion),
      'gl'
    );

    if (seccion) return seccion;

    const pendenteA =
      String(a.estado).toLowerCase().indexOf('pendente') >= 0
        ? 0
        : 1;

    const pendenteB =
      String(b.estado).toLowerCase().indexOf('pendente') >= 0
        ? 0
        : 1;

    if (pendenteA !== pendenteB) {
      return pendenteA - pendenteB;
    }

    return (
      String(b.dataIso || '').localeCompare(
        String(a.dataIso || '')
      ) ||
      Number(a.orde || 9999) -
        Number(b.orde || 9999)
    );
  });

  return {
    ok: true,
    perfil: perfil,
    nivel: perfil.nivel,
    documentos: documentos
  };
}

function obterFicheiroDocumentacion_(datos) {
  const email = normalizarEmailDoc_(datos && datos.email);
  const ruta = String(datos && datos.ruta || '').trim();
  const clase = String(datos && datos.clase || '').trim();

  if (!ruta) {
    return {
      ok: false,
      erro: 'Non se indicou o documento'
    };
  }

  const listado = listarDocumentacionPortal_({
    email: email
  });

  if (!listado.ok) return listado;

  const autorizado = listado.documentos.some(
    function(documento) {
      return (
        documento.ruta === ruta &&
        documento.clase === clase
      );
    }
  );

  if (!autorizado) {
    return {
      ok: false,
      erro:
        'Non tes permiso para acceder a este documento'
    };
  }

  const folderId =
    clase === 'acta'
      ? DOC_PORTAL_CONFIG.folderActasId
      : DOC_PORTAL_CONFIG.folderDocumentacionId;

  const nome = ruta
    .replace(/\\/g, '/')
    .split('/')
    .pop();

  const ficheiros = DriveApp
    .getFolderById(folderId)
    .getFilesByName(nome);

  if (!ficheiros.hasNext()) {
    return {
      ok: false,
      erro:
        'Non se localizou o ficheiro solicitado'
    };
  }

  const ficheiro = ficheiros.next();
  const blob = ficheiro.getBlob();

  return {
    ok: true,
    nomeFicheiro: ficheiro.getName(),
    mimeType:
      blob.getContentType() ||
      'application/pdf',
    base64:
      Utilities.base64Encode(
        blob.getBytes()
      )
  };
}

function obterContextoDocumentacion_() {
  const libroDocumentos = SpreadsheetApp.openById(
    DOC_PORTAL_CONFIG.documentosSpreadsheetId
  );

  const documentos = libroDocumentos.getSheetByName(
    DOC_PORTAL_CONFIG.sheetDocumentacion
  );

  const actas = libroDocumentos.getSheetByName(
    DOC_PORTAL_CONFIG.sheetActas
  );

  const usuarios = SpreadsheetApp
    .openById(
      DOC_PORTAL_CONFIG.usuariosSpreadsheetId
    )
    .getSheetById(
      DOC_PORTAL_CONFIG.usuariosSheetId
    );

  const persoas = SpreadsheetApp
    .openById(
      DOC_PORTAL_CONFIG.persoasSpreadsheetId
    )
    .getSheetById(
      DOC_PORTAL_CONFIG.persoasSheetId
    );

  if (
    !documentos ||
    documentos.getName() !==
      DOC_PORTAL_CONFIG.sheetDocumentacion
  ) {
    throw new Error(
      'Non se atopou a folla Documentación'
    );
  }

  if (
    !actas ||
    actas.getName() !== DOC_PORTAL_CONFIG.sheetActas
  ) {
    throw new Error(
      'Non se atopou a folla Actas XD e AX'
    );
  }

  if (
    !usuarios ||
    usuarios.getName() !== 'UsuariosWeb'
  ) {
    throw new Error(
      'Non se atopou a folla UsuariosWeb'
    );
  }

  if (
    !persoas ||
    persoas.getName() !== 'Persoas'
  ) {
    throw new Error(
      'Non se atopou a folla Persoas'
    );
  }

  return {
    documentos: documentos,
    actas: actas,
    usuarios: usuarios,
    persoas: persoas
  };
}

function lerDocumentosXerais_(sheet, perfil) {
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const valores = sheet
    .getDataRange()
    .getDisplayValues();

  const headers = mapaHeadersDoc_(
    valores.shift()
  );

  requireHeaderDoc_(headers, 'Id_Documento', 'Documentación');
  requireHeaderDoc_(headers, 'Publicar_Portal', 'Documentación');
  requireHeaderDoc_(headers, 'Nivel_Acceso', 'Documentación');
  requireHeaderDoc_(headers, 'Ficheiro', 'Documentación');

  return valores.reduce(function(saida, row) {
    if (
      !verdadeiroDoc_(
        valorFilaDoc_(row, headers, 'Publicar_Portal')
      )
    ) {
      return saida;
    }

    const nivel = nivelCanonicoDoc_(
      valorFilaDoc_(row, headers, 'Nivel_Acceso')
    );

    if (!podeVerDoc_(perfil.nivel, nivel)) {
      return saida;
    }

    const ruta = textoFilaDoc_(
      row,
      headers,
      'Ficheiro'
    );

    if (!ruta) return saida;

    const idDocumento = textoFilaDoc_(
      row,
      headers,
      'Id_Documento'
    );

    if (!idDocumento) return saida;

    const titulo = textoFilaDoc_(
      row,
      headers,
      'Título'
    );

    const tipo =
      textoFilaDoc_(
        row,
        headers,
        'Tipo_Documento'
      ) || 'Outros';

    const observacions = textoFilaDoc_(
      row,
      headers,
      'Observacións'
    );

    const seccion =
      nivel === 'Administración'
        ? 'administracion'
        : eTransparenciaDoc_(
            titulo,
            tipo,
            observacions
          )
          ? 'transparencia'
          : 'xeral';

    const data = textoFilaDoc_(
      row,
      headers,
      'Data_Documento'
    );

    saida.push({
      id: idDocumento,
      idDocumento: idDocumento,
      clase: 'documento',
      seccion: seccion,
      titulo: titulo,
      tipo: tipo,
      data: data,
      dataIso: isoDesdeDataDoc_(data),
      ano: textoFilaDoc_(row, headers, 'Ano'),
      organismo: textoFilaDoc_(
        row,
        headers,
        'Organismo_Emisor'
      ),
      descricion: textoFilaDoc_(
        row,
        headers,
        'Descrición'
      ),
      estado: textoFilaDoc_(
        row,
        headers,
        'Estado'
      ),
      nivel: nivel,
      orde:
        Number(
          valorFilaDoc_(row, headers, 'Orde') ||
          9999
        ),
      ruta: ruta
    });

    return saida;
  }, []);
}

function lerActas_(sheet, perfil) {
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const valores = sheet
    .getDataRange()
    .getDisplayValues();

  const headers = mapaHeadersDoc_(
    valores.shift()
  );

  requireHeaderDoc_(headers, 'Id_Actas', 'Actas XD e AX');
  requireHeaderDoc_(headers, 'Publicar_Portal', 'Actas XD e AX');
  requireHeaderDoc_(headers, 'Nivel_Acceso', 'Actas XD e AX');
  requireHeaderDoc_(headers, 'Acta', 'Actas XD e AX');

  return valores.reduce(function(saida, row) {
    if (
      !verdadeiroDoc_(
        valorFilaDoc_(row, headers, 'Publicar_Portal')
      )
    ) {
      return saida;
    }

    const nivel = nivelCanonicoDoc_(
      valorFilaDoc_(row, headers, 'Nivel_Acceso')
    );

    if (!podeVerDoc_(perfil.nivel, nivel)) {
      return saida;
    }

    const ruta = textoFilaDoc_(
      row,
      headers,
      'Acta'
    );

    if (!ruta) return saida;

    const idActa = textoFilaDoc_(
      row,
      headers,
      'Id_Actas'
    );

    if (!idActa) return saida;

    const data = textoFilaDoc_(
      row,
      headers,
      'Data'
    );

    saida.push({
      id: idActa,
      idActa: idActa,
      clase: 'acta',
      seccion: 'actas',
      titulo:
        textoFilaDoc_(
          row,
          headers,
          'Título'
        ) || 'Acta',
      tipo: 'Acta',
      organo: textoFilaDoc_(
        row,
        headers,
        'Órgano'
      ),
      tipoSesion: textoFilaDoc_(
        row,
        headers,
        'Tipo de sesión'
      ),
      numero: textoFilaDoc_(
        row,
        headers,
        'Número de sesión'
      ),
      data: data,
      dataIso: isoDesdeDataDoc_(data),
      ano: textoFilaDoc_(
        row,
        headers,
        'Libro Actas'
      )
        .replace(/\./g, '')
        .trim(),
      descricion: textoFilaDoc_(
        row,
        headers,
        'Observacións'
      ),
      estado: textoFilaDoc_(
        row,
        headers,
        'Estado'
      ),
      nivel: nivel,
      dataAprobacion: textoFilaDoc_(
        row,
        headers,
        'Data_Aprobacion'
      ),
      ruta: ruta
    });

    return saida;
  }, []);
}

function obterPerfilDocumentacion_(contexto, email) {
  email = normalizarEmailDoc_(email);

  if (!email) return null;

  const datosUsuarios = contexto.usuarios
    .getDataRange()
    .getDisplayValues();

  if (datosUsuarios.length < 2) {
    return null;
  }

  const hu = mapaHeadersDoc_(datosUsuarios.shift());

  requireHeaderDoc_(hu, 'Email', 'UsuariosWeb');
  requireHeaderDoc_(hu, 'Activo', 'UsuariosWeb');
  requireHeaderDoc_(hu, 'Persoa', 'UsuariosWeb');

  const usuario = datosUsuarios.find(function(row) {
    return (
      normalizarEmailDoc_(
        valorFilaDoc_(row, hu, 'Email')
      ) === email &&
      verdadeiroDoc_(
        valorFilaDoc_(row, hu, 'Activo')
      )
    );
  });

  if (!usuario) return null;

  const persoaRef = textoFilaDoc_(
    usuario,
    hu,
    'Persoa'
  );

  const datosPersoas = contexto.persoas
    .getDataRange()
    .getDisplayValues();

  if (datosPersoas.length < 2) {
    return null;
  }

  const hp = mapaHeadersDoc_(datosPersoas.shift());

  requireHeaderDoc_(hp, 'Id', 'Persoas');

  const persoa = datosPersoas.find(function(row) {
    const id = textoFilaDoc_(
      row,
      hp,
      'Id'
    );

    const correo = normalizarEmailDoc_(
      valorFilaDoc_(
        row,
        hp,
        'Correo electrónico'
      ) ||
      valorFilaDoc_(row, hp, 'Email')
    );

    return (
      (persoaRef && id === persoaRef) ||
      correo === email
    );
  });

  if (!persoa) return null;

  const cargo = textoFilaDoc_(
    persoa,
    hp,
    'Cargo'
  );

  const nomePersoa =
    textoFilaDoc_(
      persoa,
      hp,
      'Nomecompleto'
    ) ||
    textoFilaDoc_(
      persoa,
      hp,
      'NomeCompleto'
    ) ||
    textoFilaDoc_(
      persoa,
      hp,
      'Nome completo'
    ) ||
    textoFilaDoc_(
      persoa,
      hp,
      'Nome'
    );

  return {
    email: email,
    idPersoa: textoFilaDoc_(
      persoa,
      hp,
      'Id'
    ),
    nome:
      textoFilaDoc_(
        usuario,
        hu,
        'Nome'
      ) ||
      nomePersoa,
    cargo: cargo,
    nivel: nivelDesdeCargoDoc_(cargo)
  };
}

function nivelDesdeCargoDoc_(cargo) {
  const valor = normalizarTextoDoc_(cargo);

  const cargosAdministracion = [
    'presidente',
    'presidenta',
    'vicepresidente',
    'vicepresidenta',
    'secretario',
    'secretaria',
    'vicesecretario',
    'vicesecretaria',
    'tesoureiro',
    'tesoureira',
    'contador',
    'contadora'
  ];

  const eAdministracion =
    cargosAdministracion.some(function(cargoAdmin) {
      return valor.indexOf(cargoAdmin) >= 0;
    });

  if (eAdministracion) {
    return 'Administración';
  }

  if (
    valor &&
    valor !== 'ningun' &&
    valor !== 'ningunha'
  ) {
    return 'Xunta Directiva';
  }

  return 'Coralistas';
}

function nivelCanonicoDoc_(nivel) {
  const valor = normalizarTextoDoc_(nivel);

  if (valor === 'administracion') {
    return 'Administración';
  }

  if (valor === 'xunta directiva') {
    return 'Xunta Directiva';
  }

  return 'Coralistas';
}

function podeVerDoc_(
  nivelUsuario,
  nivelDocumento
) {
  return (
    (DOC_NIVEIS[nivelUsuario] || 0) >=
    (DOC_NIVEIS[nivelDocumento] || 1)
  );
}

function eTransparenciaDoc_(
  titulo,
  tipo,
  observacions
) {
  const texto = normalizarTextoDoc_(
    [
      titulo,
      tipo,
      observacions
    ].join(' ')
  );

  return [
    'balance',
    'conta de resultados',
    'contas anuais',
    'transparencia'
  ].some(function(valor) {
    return texto.indexOf(valor) >= 0;
  });
}

function mapaHeadersDoc_(headers) {
  return headers.reduce(
    function(mapa, header, index) {
      mapa[String(header || '').trim()] = index;
      return mapa;
    },
    {}
  );
}

function requireHeaderDoc_(
  headers,
  cabeceira,
  folla
) {
  if (headers[cabeceira] === undefined) {
    throw new Error(
      'Falta a columna ' +
      cabeceira +
      ' na folla ' +
      folla
    );
  }
}

function valorFilaDoc_(
  row,
  headers,
  cabeceira
) {
  const indice = headers[cabeceira];
  return indice === undefined
    ? ''
    : row[indice];
}

function textoFilaDoc_(
  row,
  headers,
  cabeceira
) {
  return String(
    valorFilaDoc_(
      row,
      headers,
      cabeceira
    ) || ''
  ).trim();
}

function verdadeiroDoc_(valor) {
  return (
    valor === true ||
    [
      'true',
      'si',
      'sí',
      'yes',
      '1',
      'verdadeiro'
    ].indexOf(
      normalizarTextoDoc_(valor)
    ) >= 0
  );
}

function normalizarEmailDoc_(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase();
}

function normalizarTextoDoc_(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isoDesdeDataDoc_(valor) {
  const partes = String(valor || '')
    .match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  return partes
    ? [
        partes[3],
        partes[2].padStart(2, '0'),
        partes[1].padStart(2, '0')
      ].join('-')
    : '';
}
