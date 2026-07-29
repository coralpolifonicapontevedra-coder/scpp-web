/*
 * Portal > Administración > Persoas.
 *
 * Engadir ao despachador do doPost, despois de validar WEB_WRITE_TOKEN:
 *
 * case 'listarPersoasAdministracion':
 *   return responderJson_(listarPersoasAdministracion_(datos));
 * case 'obterFichaPersoaAdministracion':
 *   return responderJson_(obterFichaPersoaAdministracion_(datos));
 */

const PERSOAS_ADMIN_CONFIG = {
  persoasSpreadsheetId: '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
  persoasSheetId: 388888827,
  usuariosSpreadsheetId: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  usuariosSheetId: 1291817000,
  fichasFolderId: '1UmEo1fP5jyxxo90dQbXG6SM2SrmdysbN'
};

function listarPersoasAdministracion_(datos) {
  const email = normalizarEmailPersoasAdmin_(datos && datos.email);
  const contexto = obterContextoPersoasAdmin_();
  const administrador = obterAdministradorPersoasAdmin_(contexto, email);
  if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

  const valores = contexto.persoas.getDataRange().getValues();
  if (valores.length < 2) return { ok: true, perfil: administrador, persoas: [] };
  const indices = indicesPersoasAdmin_(valores[0]);

  const persoas = valores.slice(1).reduce(function(saida, fila) {
    const rowId = textoPersoasAdmin_(fila[indices['Row ID']]);
    if (!rowId) return saida;
    saida.push(construirPersoaAdmin_(fila, indices));
    return saida;
  }, []);

  persoas.sort(function(a, b) {
    return a.etiqueta.localeCompare(b.etiqueta, 'gl', { sensitivity: 'base' });
  });

  return { ok: true, perfil: administrador, persoas: persoas };
}

function obterFichaPersoaAdministracion_(datos) {
  const email = normalizarEmailPersoasAdmin_(datos && datos.email);
  const rowId = textoPersoasAdmin_(datos && datos.rowId);
  if (!rowId) return { ok: false, erro: 'Non se indicou a persoa' };

  const contexto = obterContextoPersoasAdmin_();
  const administrador = obterAdministradorPersoasAdmin_(contexto, email);
  if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

  const valores = contexto.persoas.getDataRange().getValues();
  const indices = indicesPersoasAdmin_(valores[0] || []);
  const fila = valores.slice(1).find(function(item) {
    return textoPersoasAdmin_(item[indices['Row ID']]) === rowId;
  });
  if (!fila) return { ok: false, erro: 'Non se atopou a persoa solicitada' };

  const ruta = textoPersoasAdmin_(fila[indices.Ficha]);
  if (!ruta) return { ok: false, erro: 'Esta persoa non ten ficha escaneada' };

  const nomeFicheiro = ruta.split('/').pop();
  const ficheiros = contexto.fichas.getFilesByName(nomeFicheiro);
  if (!ficheiros.hasNext()) return { ok: false, erro: 'Non se localizou a ficha escaneada' };

  const ficheiro = ficheiros.next();
  const blob = ficheiro.getBlob();
  return {
    ok: true,
    nomeFicheiro: ficheiro.getName(),
    mimeType: blob.getContentType() || 'application/pdf',
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function obterContextoPersoasAdmin_() {
  const persoas = SpreadsheetApp.openById(PERSOAS_ADMIN_CONFIG.persoasSpreadsheetId)
    .getSheetById(PERSOAS_ADMIN_CONFIG.persoasSheetId);
  const usuarios = SpreadsheetApp.openById(PERSOAS_ADMIN_CONFIG.usuariosSpreadsheetId)
    .getSheetById(PERSOAS_ADMIN_CONFIG.usuariosSheetId);
  if (!persoas || persoas.getName() !== 'Persoas') throw new Error('Non se atopou a folla Persoas');
  if (!usuarios || usuarios.getName() !== 'UsuariosWeb') throw new Error('Non se atopou a folla UsuariosWeb');
  return { persoas: persoas, usuarios: usuarios, fichas: DriveApp.getFolderById(PERSOAS_ADMIN_CONFIG.fichasFolderId) };
}

function obterAdministradorPersoasAdmin_(contexto, email) {
  if (!email) return null;
  const usuarios = contexto.usuarios.getDataRange().getValues();
  const iu = indicesPersoasAdmin_(usuarios[0] || []);
  const usuario = usuarios.slice(1).find(function(fila) {
    return normalizarEmailPersoasAdmin_(fila[iu.Email]) === email && booleanoPersoasAdmin_(fila[iu.Activo]);
  });
  if (!usuario) return null;

  const referencia = textoPersoasAdmin_(usuario[iu.Persoa]);
  const persoas = contexto.persoas.getDataRange().getValues();
  const ip = indicesPersoasAdmin_(persoas[0] || []);
  const persoa = persoas.slice(1).find(function(fila) {
    const id = textoPersoasAdmin_(fila[ip.Id]);
    const rowId = textoPersoasAdmin_(fila[ip['Row ID']]);
    return referencia && (referencia === id || referencia === rowId);
  });
  if (!persoa) return null;

  const cargo = normalizarTextoPersoasAdmin_(persoa[ip.Cargo]);
  const eAdmin = ['presidente', 'presidenta', 'secretario', 'secretaria', 'tesoureiro', 'tesoureira', 'contador', 'contadora']
    .some(function(valor) { return cargo.indexOf(valor) >= 0; });
  if (!eAdmin) return null;

  return {
    email: email,
    nome: textoPersoasAdmin_(usuario[iu.Nome]) || textoPersoasAdmin_(persoa[ip.Nomecompleto]),
    cargo: textoPersoasAdmin_(persoa[ip.Cargo]),
    nivel: 'Administración'
  };
}

function construirPersoaAdmin_(fila, indices) {
  const valor = function(cabeceira) {
    const indice = indices[cabeceira];
    return indice === undefined ? '' : fila[indice];
  };
  const texto = function(cabeceira) { return textoPersoasAdmin_(valor(cabeceira)); };
  const nome = texto('Nome');
  const primeiro = texto('Primeiro apelido');
  const segundo = texto('Segundo apelido');
  const completo = texto('Nomecompleto') || [nome, primeiro, segundo].filter(Boolean).join(' ');
  return {
    rowId: texto('Row ID'),
    id: texto('Id'),
    etiqueta: [primeiro, segundo, nome].filter(Boolean).join(' · '),
    nomeCompleto: completo,
    nome: nome,
    primeiroApelido: primeiro,
    segundoApelido: segundo,
    voz: texto('Voz'),
    nif: texto('NIF'),
    telefono: texto('Teléfono'),
    correo: texto('Correo electrónico'),
    enderezo: texto('Enderezo'),
    cidade: texto('Cidade'),
    cp: texto('CP'),
    activo: booleanoPersoasAdmin_(valor('Activo')),
    mostrarWeb: booleanoPersoasAdmin_(valor('MostrarWeb')),
    cargo: texto('Cargo'),
    tipoSocio: texto('Tipo de socio'),
    dataNacemento: formatarDataPersoasAdmin_(valor('DataNacemento')),
    dataIncorporacion: formatarDataPersoasAdmin_(valor('DataIncorporacionSCPP')),
    contactoEmerxencia: texto('ContactoEmerxencia'),
    telefonoEmerxencia: texto('TelefonoEmerxencia'),
    preferenciaComunicacion: texto('PreferenciaComunicacion'),
    consentimentoFoto: texto('ConsentimentoFoto'),
    mostrarAniversario: booleanoPersoasAdmin_(valor('MostrarAniversario')),
    observacions: texto('Observacións'),
    observacionsPrivadas: texto('ObservacionsPrivadas'),
    actualizadoPor: texto('ActualizadoPor'),
    dataActualizacion: formatarDataHoraPersoasAdmin_(valor('DataActualizacionPerfil')),
    ficha: texto('Ficha')
  };
}

function indicesPersoasAdmin_(cabeceiras) {
  return cabeceiras.reduce(function(saida, valor, indice) {
    saida[String(valor || '').trim()] = indice;
    return saida;
  }, {});
}

function textoPersoasAdmin_(valor) {
  return valor == null ? '' : String(valor).trim();
}

function normalizarEmailPersoasAdmin_(valor) {
  return textoPersoasAdmin_(valor).toLowerCase();
}

function normalizarTextoPersoasAdmin_(valor) {
  return textoPersoasAdmin_(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function booleanoPersoasAdmin_(valor) {
  if (valor === true) return true;
  return ['true', 'y', 'si', 'sí', 'yes', '1', 'verdadeiro'].indexOf(normalizarTextoPersoasAdmin_(valor)) >= 0;
}

function formatarDataPersoasAdmin_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone() || 'Europe/Madrid', 'dd/MM/yyyy');
  }
  return textoPersoasAdmin_(valor);
}

function formatarDataHoraPersoasAdmin_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone() || 'Europe/Madrid', 'dd/MM/yyyy HH:mm');
  }
  return textoPersoasAdmin_(valor);
}
