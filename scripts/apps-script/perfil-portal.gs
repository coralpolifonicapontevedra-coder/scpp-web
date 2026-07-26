/**
 * Módulo de perfil persoal do Portal do Coralista.
 *
 * Integración en Código.gs, despois de validar WEB_WRITE_TOKEN:
 *
 * if (datos.accion === 'obterPerfil') {
 *   return respostaJSON(obterPerfilPortal_(datos));
 * }
 *
 * if (datos.accion === 'actualizarPerfil') {
 *   bloqueo.waitLock(10000);
 *   try {
 *     return respostaJSON(actualizarPerfilPortal_(datos));
 *   } finally {
 *     bloqueo.releaseLock();
 *   }
 * }
 *
 * Executar unha soa vez configurarPerfilPortal().
 * A fotografía almacénase en Fotos_Perfil e na folla Persoas gárdase só a ruta.
 *
 * Importante: este módulo nunca devolve ObservacionsPrivadas nin permite editar
 * Row ID, Id, nome, NIF, voz, cargo, tipo de socio, Activo ou MostrarWeb.
 */
function configurarPerfilPortal() {
  PropertiesService.getScriptProperties().setProperties({
    PERFIL_PERSOAS_SPREADSHEET_ID: '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
    PERFIL_PERSOAS_SHEET_ID: '388888827',
    PERFIL_USUARIOS_SPREADSHEET_ID: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
    PERFIL_USUARIOS_SHEET_ID: '1291817000',
    PERFIL_FOTOS_FOLDER_ID: '1qXPUplggCFbFTTLRtm2j16af717o-bQs',
    PERFIL_FOTOS_APPSHEET_PATH: 'Fotos_Perfil/'
  });

  var contexto = obterContextoPerfil_();
  console.log(
    'Perfil configurado: ' + contexto.follaPersoas.getParent().getName() +
    ' | ' + contexto.follaPersoas.getName() +
    ' | carpeta ' + contexto.carpetaFotos.getName()
  );
}

function probarPerfilPortal() {
  var email = String(
    PropertiesService.getScriptProperties().getProperty('WEB_TEST_EMAIL') ||
    Session.getEffectiveUser().getEmail() || ''
  ).trim().toLowerCase();
  console.log(JSON.stringify(obterPerfilPortal_({ email: email })));
}

function obterPerfilPortal_(datos) {
  var email = limparPerfil_(datos && datos.email, 160).toLowerCase();
  if (!email) return { ok: false, erro: 'Falta o correo da persoa usuaria' };

  var contexto = obterContextoPerfil_();
  var usuario = obterUsuarioActivoPerfil_(contexto, email);
  if (!usuario) return { ok: false, erro: 'Usuario non autorizado' };

  var persoa = obterFilaPersoaPerfil_(contexto, usuario, email);
  if (!persoa) return { ok: false, erro: 'Non se atopou a ficha persoal asociada' };

  return {
    ok: true,
    perfil: construírRespostaPerfil_(contexto, persoa)
  };
}

function actualizarPerfilPortal_(datos) {
  datos = datos || {};
  var email = limparPerfil_(datos.email, 160).toLowerCase();
  if (!email) return { ok: false, erro: 'Falta o correo da persoa usuaria' };

  var contexto = obterContextoPerfil_();
  var usuario = obterUsuarioActivoPerfil_(contexto, email);
  if (!usuario) return { ok: false, erro: 'Usuario non autorizado' };

  var persoa = obterFilaPersoaPerfil_(contexto, usuario, email);
  if (!persoa) return { ok: false, erro: 'Non se atopou a ficha persoal asociada' };

  var correoContacto = limparPerfil_(datos.correoElectronico, 160).toLowerCase();
  if (correoContacto && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoContacto)) {
    return { ok: false, erro: 'O correo electrónico de contacto non é válido' };
  }

  var cp = limparPerfil_(datos.cp, 10);
  if (cp && !/^\d{5}$/.test(cp)) {
    return { ok: false, erro: 'O código postal debe ter cinco cifras' };
  }

  var preferencia = limparPerfil_(datos.preferenciaComunicacion, 60);
  var preferenciasPermitidas = ['', 'Correo electrónico', 'WhatsApp', 'Teléfono'];
  if (preferenciasPermitidas.indexOf(preferencia) === -1) {
    return { ok: false, erro: 'A canle de comunicación non é válida' };
  }

  var consentimento = limparPerfil_(datos.consentimentoFoto, 80);
  var consentimentosPermitidos = [
    '',
    'Non autorizo',
    'Só uso interno',
    'Uso interno e difusión pública'
  ];
  if (consentimentosPermitidos.indexOf(consentimento) === -1) {
    return { ok: false, erro: 'A opción de autorización de imaxe non é válida' };
  }

  var dataNacemento = analizarDataPerfil_(datos.dataNacemento);
  if (dataNacemento.erro) return { ok: false, erro: dataNacemento.erro };

  var valores = {
    'Teléfono': limparPerfil_(datos.telefono, 40),
    'Correo electrónico': correoContacto,
    'Enderezo': limparPerfil_(datos.enderezo, 240),
    'Cidade': limparPerfil_(datos.cidade, 120),
    'CP': cp,
    'DataNacemento': dataNacemento.valor,
    'ContactoEmerxencia': limparPerfil_(datos.contactoEmerxencia, 180),
    'TelefonoEmerxencia': limparPerfil_(datos.telefonoEmerxencia, 40),
    'PreferenciaComunicacion': preferencia,
    'ConsentimentoFoto': consentimento,
    'MostrarAniversario': valorBooleanoPerfil_(datos.mostrarAniversario),
    'DataActualizacionPerfil': new Date(),
    'ActualizadoPor': email
  };

  var novaFoto = gardarFotoPerfil_(contexto, persoa, datos);
  if (novaFoto.erro) return { ok: false, erro: novaFoto.erro };
  if (novaFoto.ruta) valores.FotoPerfil = novaFoto.ruta;

  Object.keys(valores).forEach(function(cabeceira) {
    var indice = persoa.indices[cabeceira];
    if (indice !== undefined && indice !== -1) {
      contexto.follaPersoas
        .getRange(persoa.numeroFila, indice + 1)
        .setValue(valores[cabeceira]);
    }
  });

  SpreadsheetApp.flush();

  var persoaActualizada = obterFilaPersoaPerfil_(contexto, usuario, email);
  return {
    ok: true,
    mensaxe: 'Os datos do perfil gardáronse correctamente',
    perfil: construírRespostaPerfil_(contexto, persoaActualizada)
  };
}

function obterContextoPerfil_() {
  var propiedades = PropertiesService.getScriptProperties();
  var persoasSpreadsheetId = propiedades.getProperty('PERFIL_PERSOAS_SPREADSHEET_ID');
  var persoasSheetId = Number(propiedades.getProperty('PERFIL_PERSOAS_SHEET_ID'));
  var usuariosSpreadsheetId = propiedades.getProperty('PERFIL_USUARIOS_SPREADSHEET_ID');
  var usuariosSheetId = Number(propiedades.getProperty('PERFIL_USUARIOS_SHEET_ID'));
  var folderId = propiedades.getProperty('PERFIL_FOTOS_FOLDER_ID');

  if (!persoasSpreadsheetId || !persoasSheetId ||
      !usuariosSpreadsheetId || !usuariosSheetId || !folderId) {
    throw new Error('Falta configurar o módulo Perfil');
  }

  var follaPersoas = SpreadsheetApp
    .openById(persoasSpreadsheetId)
    .getSheetById(persoasSheetId);
  var follaUsuarios = SpreadsheetApp
    .openById(usuariosSpreadsheetId)
    .getSheetById(usuariosSheetId);

  if (!follaPersoas || follaPersoas.getName() !== 'Persoas') {
    throw new Error('Non se atopou a folla Persoas configurada');
  }
  if (!follaUsuarios || follaUsuarios.getName() !== 'UsuariosWeb') {
    throw new Error('Non se atopou a folla UsuariosWeb configurada');
  }

  return {
    propiedades: propiedades,
    follaPersoas: follaPersoas,
    follaUsuarios: follaUsuarios,
    carpetaFotos: DriveApp.getFolderById(folderId)
  };
}

function obterUsuarioActivoPerfil_(contexto, email) {
  var valores = contexto.follaUsuarios.getDataRange().getValues();
  if (valores.length < 2) return null;
  var cabeceiras = valores[0].map(function(v) { return String(v || '').trim(); });
  var indices = crearIndicesPerfil_(cabeceiras);
  var necesarias = ['Persoa', 'Email', 'Activo'];
  necesarias.forEach(function(nome) {
    if (indices[nome] === undefined) throw new Error('Falta a columna ' + nome + ' en UsuariosWeb');
  });

  for (var i = 1; i < valores.length; i += 1) {
    var fila = valores[i];
    if (String(fila[indices.Email] || '').trim().toLowerCase() === email &&
        valorBooleanoPerfil_(fila[indices.Activo])) {
      return {
        referenciaPersoa: String(fila[indices.Persoa] || '').trim(),
        email: email
      };
    }
  }
  return null;
}

function obterFilaPersoaPerfil_(contexto, usuario, email) {
  var valores = contexto.follaPersoas.getDataRange().getValues();
  if (valores.length < 2) return null;
  var cabeceiras = valores[0].map(function(v) { return String(v || '').trim(); });
  var indices = crearIndicesPerfil_(cabeceiras);
  ['Row ID', 'Id', 'Correo electrónico'].forEach(function(nome) {
    if (indices[nome] === undefined) throw new Error('Falta a columna ' + nome + ' en Persoas');
  });

  var referencia = String(usuario.referenciaPersoa || '').trim();
  var candidataCorreo = null;

  for (var i = 1; i < valores.length; i += 1) {
    var fila = valores[i];
    var rowId = String(fila[indices['Row ID']] || '').trim();
    var id = String(fila[indices.Id] || '').trim();
    var correo = String(fila[indices['Correo electrónico']] || '').trim().toLowerCase();

    if (referencia && (rowId === referencia || id === referencia)) {
      return { numeroFila: i + 1, fila: fila, cabeceiras: cabeceiras, indices: indices };
    }
    if (!candidataCorreo && correo && correo === email) {
      candidataCorreo = { numeroFila: i + 1, fila: fila, cabeceiras: cabeceiras, indices: indices };
    }
  }

  return candidataCorreo;
}

function construírRespostaPerfil_(contexto, persoa) {
  var valor = function(nome) {
    var indice = persoa.indices[nome];
    return indice === undefined ? '' : persoa.fila[indice];
  };
  var texto = function(nome) {
    var v = valor(nome);
    return v == null ? '' : String(v).trim();
  };

  var nomeCompleto = texto('Nomecompleto') || [
    texto('Nome'),
    texto('Primeiro apelido'),
    texto('Segundo apelido')
  ].filter(Boolean).join(' ');

  var rutaFoto = texto('FotoPerfil');
  var foto = obterFotoPerfilBase64_(contexto, rutaFoto);

  return {
    nomeCompleto: nomeCompleto,
    nome: texto('Nome'),
    primeiroApelido: texto('Primeiro apelido'),
    segundoApelido: texto('Segundo apelido'),
    nif: texto('NIF'),
    voz: texto('Voz'),
    cargo: texto('Cargo'),
    tipoSocio: texto('Tipo de socio'),
    telefono: texto('Teléfono'),
    correoElectronico: texto('Correo electrónico'),
    enderezo: texto('Enderezo'),
    cidade: texto('Cidade'),
    cp: texto('CP'),
    dataNacemento: formatarDataInputPerfil_(valor('DataNacemento')),
    contactoEmerxencia: texto('ContactoEmerxencia'),
    telefonoEmerxencia: texto('TelefonoEmerxencia'),
    preferenciaComunicacion: texto('PreferenciaComunicacion'),
    consentimentoFoto: texto('ConsentimentoFoto'),
    mostrarAniversario: valorBooleanoPerfil_(valor('MostrarAniversario')),
    fotoPerfil: rutaFoto,
    fotoDataUrl: foto.dataUrl,
    fotoAviso: foto.aviso,
    dataActualizacionPerfil: formatarDataHoraPerfil_(valor('DataActualizacionPerfil')),
    actualizadoPor: texto('ActualizadoPor')
  };
}

function gardarFotoPerfil_(contexto, persoa, datos) {
  var base64 = String(datos.fotoBase64 || '').trim();
  if (!base64) return { ruta: '' };

  var tipo = String(datos.fotoTipo || '').trim().toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(tipo) === -1) {
    return { erro: 'O formato da fotografía de perfil non é compatible' };
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (erro) {
    return { erro: 'Non foi posible ler a fotografía de perfil' };
  }
  if (bytes.length > 2 * 1024 * 1024) {
    return { erro: 'A fotografía de perfil supera o máximo permitido' };
  }

  var rowId = String(persoa.fila[persoa.indices['Row ID']] || 'persoa')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 80);
  var extension = tipo === 'image/png' ? '.png' : tipo === 'image/webp' ? '.webp' : '.jpg';
  var marca = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyyMMdd-HHmmss');
  var nome = rowId + '-' + marca + extension;

  var indiceFoto = persoa.indices.FotoPerfil;
  if (indiceFoto !== undefined) {
    eliminarFotoAnteriorPerfil_(contexto, String(persoa.fila[indiceFoto] || '').trim());
  }

  var ficheiro = contexto.carpetaFotos.createFile(
    Utilities.newBlob(bytes, tipo, nome)
  );
  var prefixo = String(
    contexto.propiedades.getProperty('PERFIL_FOTOS_APPSHEET_PATH') || 'Fotos_Perfil/'
  ).replace(/\/+/g, '') + '/';

  return { ruta: prefixo + ficheiro.getName() };
}

function eliminarFotoAnteriorPerfil_(contexto, ruta) {
  var nome = String(ruta || '').split('/').pop();
  if (!nome) return;
  var ficheiros = contexto.carpetaFotos.getFilesByName(nome);
  while (ficheiros.hasNext()) {
    ficheiros.next().setTrashed(true);
  }
}

function obterFotoPerfilBase64_(contexto, ruta) {
  var nome = String(ruta || '').split('/').pop();
  if (!nome) return { dataUrl: '', aviso: '' };
  var ficheiros = contexto.carpetaFotos.getFilesByName(nome);
  if (!ficheiros.hasNext()) {
    return { dataUrl: '', aviso: 'A fotografía rexistrada non se atopou na carpeta privada' };
  }
  var blob = ficheiros.next().getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > 2 * 1024 * 1024) {
    return { dataUrl: '', aviso: 'A fotografía é demasiado grande para a previsualización' };
  }
  return {
    dataUrl: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' +
      Utilities.base64Encode(bytes),
    aviso: ''
  };
}

function analizarDataPerfil_(valor) {
  var texto = String(valor || '').trim();
  if (!texto) return { valor: '' };
  var partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return { erro: 'A data de nacemento non é válida' };
  var ano = Number(partes[1]);
  var mes = Number(partes[2]);
  var dia = Number(partes[3]);
  var data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia ||
      ano < 1900 || data.getTime() > new Date().getTime()) {
    return { erro: 'A data de nacemento non é válida' };
  }
  return { valor: data };
}

function formatarDataInputPerfil_(valor) {
  if (!valor) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, 'Europe/Madrid', 'yyyy-MM-dd');
  }
  var texto = String(valor).trim();
  var formatoGalego = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (formatoGalego) {
    return formatoGalego[3] + '-' + ('0' + formatoGalego[2]).slice(-2) + '-' +
      ('0' + formatoGalego[1]).slice(-2);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : '';
}

function formatarDataHoraPerfil_(valor) {
  if (!valor) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, 'Europe/Madrid', 'dd/MM/yyyy HH:mm');
  }
  return String(valor).trim();
}

function crearIndicesPerfil_(cabeceiras) {
  var indices = {};
  cabeceiras.forEach(function(nome, indice) {
    indices[String(nome || '').trim()] = indice;
  });
  return indices;
}

function valorBooleanoPerfil_(valor) {
  if (valor === true) return true;
  return ['true', 'verdadero', 'verdadeiro', 'si', 'sí', 'yes', '1']
    .indexOf(String(valor || '').trim().toLowerCase()) !== -1;
}

function limparPerfil_(valor, maximo) {
  return String(valor == null ? '' : valor).trim().slice(0, maximo || 5000);
}
